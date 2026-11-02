"""Local TCP, JSON lines: every client gets each message as one line, and the last table state when it connects."""

import json
import socket
import threading


class Hub:
    def __init__(self, port: int, host: str = "127.0.0.1"):
        self.clients, self.last, self.lock = [], None, threading.Lock()
        self.first = threading.Event()
        self.srv = socket.create_server((host, port))
        self.host, self.port = host, self.srv.getsockname()[1]
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while True:
            try:
                c, _ = self.srv.accept()
            except OSError:
                return
            c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            with self.lock:
                self.clients.append(c)
                if self.last:
                    self._send_to(c, self.last)
            self.first.set()

    def _send_to(self, c, line):
        try:
            c.sendall(line)
        except OSError:
            self.clients.remove(c)

    def send(self, msg, keep=False):
        line = (json.dumps(msg) + "\n").encode()
        with self.lock:
            if keep:
                self.last = line
            for c in list(self.clients):
                self._send_to(c, line)

    def close(self):
        with self.lock:
            for c in self.clients:
                try:
                    c.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                c.close()
            self.clients = []
        self.srv.close()
