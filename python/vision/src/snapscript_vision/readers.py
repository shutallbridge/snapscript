"""Handwriting readers, chosen by configuration: `openrouter` (the cloud read) or `fake:FAKE.json` (for tests).

A reader takes a whiteboard's picture and starts a read: `request(image, t)` gives a handle at once, and the
service polls it each frame with `poll(now)` until it gives an `Answer`. An answer is the text read (`""` when no
text came back), or `failed` when the request didn't get through: it couldn't connect, or the server failed.

- **OpenRouter**: Gemma 4 31B through OpenRouter (#110), one request per read on its own thread. The API key is
  `OPENROUTER_API_KEY` in the environment, never in a file. The URL, model and timeout are settings.
- **Fake**: answers from a JSON file in order, the last one repeating, each `after_s` of frame time after the
  call, and notes every call as a JSON line in the file named by `calls`:

      {"answers": [{"text": "500", "after_s": 2.0}, {"fail": "connect"}, {"text": ""}],
       "calls": "calls.jsonl"}
"""

import base64
import io
import json
import os
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from .settings import Settings

KEY_ENV = "OPENROUTER_API_KEY"
PROMPT = ("This is a photo of a small whiteboard on a card. Write out exactly what is handwritten on it, "
          "character for character, and nothing else. If nothing is written, reply with nothing.")


@dataclass(frozen=True)
class Answer:
    text: str | None = None     # what was read ("" for no text); None when the request failed
    failed: bool = False


def make(spec: str, settings: Settings):
    kind, _, arg = spec.partition(":")
    if kind == "openrouter":
        return OpenRouter(settings)
    if kind == "fake":
        return Fake(arg)
    raise ValueError(f"unknown handwriting reader {spec!r} (openrouter or fake:FAKE.json)")


class Fake:
    def __init__(self, path):
        d = json.loads(Path(path).read_text())
        self.answers, self.calls, self.n = d["answers"], d.get("calls"), 0

    def request(self, image, t):
        a = self.answers[min(self.n, len(self.answers) - 1)]
        self.n += 1
        if self.calls:
            with open(self.calls, "a") as f:
                f.write(json.dumps({"t": t, "size": [int(image.shape[1]), int(image.shape[0])]}) + "\n")
        answer = Answer(failed=True) if "fail" in a else Answer(text=a.get("text", ""))
        return _FakeRead(t + float(a.get("after_s", 0.0)), answer)


@dataclass
class _FakeRead:
    due: float
    answer: Answer

    def poll(self, now):
        return self.answer if now >= self.due else None


class OpenRouter:
    def __init__(self, s: Settings):
        self.key = os.environ.get(KEY_ENV)
        if not self.key:
            raise SystemExit(f"snapscript-vision: the openrouter reader needs its API key in {KEY_ENV}")
        self.s = s

    def request(self, image, t):
        read = _ThreadRead()
        threading.Thread(target=read.run, args=(self._read, image), daemon=True).start()
        return read

    def _read(self, image) -> Answer:
        buf = io.BytesIO()
        Image.fromarray(image).save(buf, "PNG")
        url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        body = {"model": self.s.reader_model, "messages": [{"role": "user", "content": [
            {"type": "text", "text": PROMPT}, {"type": "image_url", "image_url": {"url": url}}]}]}
        req = urllib.request.Request(self.s.reader_url, json.dumps(body).encode(), method="POST", headers={
            "Authorization": f"Bearer {self.key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=self.s.reader_timeout_s) as r:
                reply = json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code >= 500 or e.code == 429:
                return Answer(failed=True)  # the server failed, or is busy: try again later
            # anything else is a request the server refused (a bad key, say): no text came back
            print(f"snapscript-vision: reader refused the request: HTTP {e.code}", flush=True)
            return Answer(text="")
        except (OSError, ValueError):
            return Answer(failed=True)  # couldn't connect, timed out, or the reply was cut off
        try:
            text = reply["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            text = ""
        return Answer(text=text.strip())


class _ThreadRead:
    def __init__(self):
        self.answer = None

    def run(self, read, image):
        try:
            self.answer = read(image)
        except Exception:  # noqa: BLE001 - a read that blows up is a failed request, not a dead service
            self.answer = Answer(failed=True)

    def poll(self, now):
        return self.answer
