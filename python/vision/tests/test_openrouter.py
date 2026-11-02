"""The cloud handwriting reader: OpenRouter, its key from the environment and never from the repo (#171).

These tests point the reader at a stand-in server on 127.0.0.1, never the network."""

import json
import os
import re
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest
from vision_harness import Card, hw_of, run_drawn, written

NUM = 1027
REPO = Path(__file__).resolve().parents[3]


class StandIn:
    """An OpenRouter-shaped chat completions endpoint that answers every request the same way."""

    def __init__(self, status=200, text="500"):
        self.requests = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                outer.requests.append({"auth": self.headers.get("Authorization"), "body": body})
                reply = json.dumps({"choices": [{"message": {"role": "assistant", "content": text}}]}).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(reply)))
                self.end_headers()
                self.wfile.write(reply)

            def log_message(self, *a):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/api/v1/chat/completions"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()


@pytest.fixture
def stand_in():
    made = []

    def make(**kw):
        made.append(StandIn(**kw))
        return made[-1]

    yield make
    for s in made:
        s.close()


def env_with(**kw):
    env = {k: v for k, v in os.environ.items() if k != "OPENROUTER_API_KEY"}
    env.update(kw)
    return env


def test_the_reader_sends_the_whiteboard_with_the_key_from_the_environment(tmp_path, stand_in):
    server = stand_in(text="500")
    card = Card(NUM, 120, 120, ink=written("500"))
    sent = run_drawn(tmp_path, [[card]] * 80, reader="openrouter", env=env_with(OPENROUTER_API_KEY="test-key"),
                     settings={"reader_url": server.url, "reader_model": "google/gemma-4-31b-it"})

    assert hw_of(sent, NUM)[-1] == {"state": "read", "text": "500"}
    [req] = server.requests
    assert req["auth"] == "Bearer test-key"
    assert req["body"]["model"] == "google/gemma-4-31b-it"
    parts = req["body"]["messages"][0]["content"]
    assert any(p["type"] == "image_url" and p["image_url"]["url"].startswith("data:image/png;base64,")
               for p in parts)


def test_a_server_error_is_a_connection_error(tmp_path, stand_in):
    server = stand_in(status=503)
    card = Card(NUM, 120, 120, ink=written("500"))
    sent = run_drawn(tmp_path, [[card]] * 80, reader="openrouter", env=env_with(OPENROUTER_API_KEY="test-key"),
                     settings={"reader_url": server.url})

    assert hw_of(sent, NUM)[-1] == {"state": "connection error"}


def test_the_reader_wont_start_without_its_key(tmp_path):
    with pytest.raises(AssertionError, match="OPENROUTER_API_KEY"):
        run_drawn(tmp_path, [[Card(1001, 150, 120)]] * 3, reader="openrouter", env=env_with())


def test_no_openrouter_key_is_in_the_repo():
    files = subprocess.run(["git", "ls-files", "-z"], cwd=REPO, capture_output=True, check=True).stdout
    keyish = re.compile(rb"sk-or-[A-Za-z0-9-]{16,}")
    hits = [f for f in files.decode().split("\0") if f and (REPO / f).is_file()
            and keyish.search((REPO / f).read_bytes())]
    assert hits == []
