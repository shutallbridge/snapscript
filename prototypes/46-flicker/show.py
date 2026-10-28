"""PROTOTYPE (#46), throwaway: a full-screen window on the projector that shows
whatever /tmp/flicker46-show says, checked every 50 ms:

    #rrggbb          a plain field
    image <path>     an image, stretched to the screen

Start it on the Pi's desktop (from SSH):  DISPLAY=:0 python3 show.py &
"""

import tkinter as tk
from pathlib import Path

CMD = Path("/tmp/flicker46-show")
CMD.write_text("#000000")

root = tk.Tk()
root.attributes("-fullscreen", True)
root.configure(cursor="none", bg="black")
canvas = tk.Canvas(root, highlightthickness=0, bg="black")
canvas.pack(fill="both", expand=True)
state = {"cmd": None, "img": None}


def poll():
    cmd = CMD.read_text().strip()
    if cmd != state["cmd"]:
        state["cmd"] = cmd
        canvas.delete("all")
        if cmd.startswith("image "):
            state["img"] = tk.PhotoImage(file=cmd[6:])
            canvas.configure(bg="black")
            canvas.create_image(0, 0, image=state["img"], anchor="nw")
        else:
            canvas.configure(bg=cmd)
    root.after(50, poll)


poll()
root.mainloop()
