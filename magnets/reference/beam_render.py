"""PROTOTYPE (#81): render beam.py's STLs. Throwaway."""
import pyvista as pv
from pathlib import Path
OUT = Path(__file__).parent / "beam-out"
COL = {"frame": "#c9a227", "core": "#6e7681", "front_face": "#58a6ff", "back_face": "#3fb950"}
for tag in ["2u-get-single", "2u-color-double", "4u-get-single", "4u-color-double"]:
    L = 30 * int(tag[0])
    # 1: frame + core, looking in from the front, left end toward the viewer
    p = pv.Plotter(off_screen=True, window_size=(900, 700)); p.set_background("white")
    for k in ("frame", "core"):
        m = pv.read(OUT / f"{tag}-{k}.stl"); p.add_mesh(m, color=COL[k]); p.add_mesh(m.extract_feature_edges(30), color="black", line_width=1)
    p.camera_position = [(-40, 15, 55), (22, 15, 0), (1, 0, 0)]
    p.screenshot(OUT / f"{tag}-iso.png"); p.close()
    # 2: straight down on the beam, read position
    p = pv.Plotter(off_screen=True, window_size=(900, 700)); p.set_background("white")
    for k in ("frame", "core"):
        m = pv.read(OUT / f"{tag}-{k}.stl"); p.add_mesh(m, color=COL[k]); p.add_mesh(m.extract_feature_edges(30), color="black", line_width=2)
    p.camera_position = [(2, 15, 45), (20, 15, 1), (1, 0, 0)]; p.camera.zoom(1.5)
    p.screenshot(OUT / f"{tag}-read.png"); p.close()
    # 3: exploded, all parts
    p = pv.Plotter(off_screen=True, window_size=(900, 700)); p.set_background("white")
    dz = {"back_face": -18, "frame": 0, "core": 16, "front_face": 32}
    for k, z in dz.items():
        f = OUT / f"{tag}-{k}.stl"
        if f.exists():
            p.add_mesh(pv.read(f).translate((0, 0, z)), color=COL[k])
    p.camera_position = [(-60, -100, 110), (L / 2, 15, 6), (0, 0, 1)]
    p.screenshot(OUT / f"{tag}-exploded.png"); p.close()
print("ok")
