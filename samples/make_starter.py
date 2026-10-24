# Builds samples/starter.storyboard (project.json only) from the generic kitchen samples, per docs/project-format.md.
# Run: python3 samples/make_starter.py samples/starter.storyboard
import json, sys, zipfile
out = sys.argv[1]
shots = {
    "1": [("WS", "Kitchen, A at the counter, door in background", "25mm", "FIX", ""),
          ("MCU", "A pours coffee", "50mm", "FIX", ""),
          ("MS", "B enters, stops at the table", "32mm", "Dolly in", "[GRIP] Dolly track along window wall"),
          ("CU", "A reacts", "75mm", "FIX", "")],
    "2": [("EWS", "Yard, car and tree, house behind", "21mm", "FIX", ""),
          ("MS", "B by the car, looking to house", "40mm", "Pan", ""),
          ("MLS", "A stops at the tree", "32mm", "Dolly lateral", "[GRIP] Dolly")],
    "3": [("WS", "Top-down-ish view of the table, A seated", "18mm", "FIX", "[VALO] Pendant only"),
          ("CU", "Cold coffee cup", "100mm", "FIX", ""),
          ("MCU", "A", "65mm", "Slow push in", "")],
}
project = {
    "title": "Kitchen test (starter)",
    "id": "starter-kitchen-test",
    "ratio": 2.39,
    "sensor": "mlf-45k-og",
    "lenses": [14, 18, 25, 35, 50, 85, 100, 135, 150, 180],
    "characters": [{"name": "A", "model": "adult-male", "height": 182}, {"name": "B", "model": "adult-female", "height": 168}],
    "scenes": [
        {"kohtaus": "1", "intExt": "INT", "lokaatio": "KEITTIÖ", "aika": "PÄIVÄ", "synopsis": "A makes coffee. B comes in from the yard with news.", "henkilot": "A, B", "actBefore": "ACT 1"},
        {"kohtaus": "2", "intExt": "EXT", "lokaatio": "PIHA", "aika": "ILTA", "synopsis": "B waits by the car. A comes out and stops at the tree.", "henkilot": "A, B"},
        {"kohtaus": "3", "intExt": "INT", "lokaatio": "KEITTIÖ", "aika": "YÖ", "synopsis": "A alone at the table. The coffee has gone cold.", "henkilot": "A"},
    ],
    "boards": [
        {"kohtaus": k, "kuva": str(i + 1), "kuvakoko": s, "sisalto": c, "lens": l, "movement": m, "notes": n}
        for k, rows in shots.items() for i, (s, c, l, m, n) in enumerate(rows)
    ],
    "locations": [
        {"name": "KEITTIÖ", "tag": "assumed", "room": {"exterior": False, "w": 5.0, "d": 4.0, "h": 2.6,
            "door": {"wall": "e", "offset": 0, "width": 0.9, "height": 2.1},
            "window": {"wall": "s", "offset": 0, "width": 1.4, "height": 1.2, "sill": 0.9}, "north": 0},
         "objects": [
            {"kind": "object", "model": "table-sit-rectangle", "x": 0, "z": 0, "y": 0, "rot": 0, "w": 140, "d": 90, "h": 77},
            {"kind": "object", "model": "table-counter", "x": 0, "z": -1.65, "y": 0, "rot": 180, "w": 188, "d": 65, "h": 92}]},
        {"name": "PIHA", "tag": "assumed", "room": {"exterior": True, "w": 5.0, "d": 4.0, "h": 2.6, "door": None, "window": None, "north": 0},
         "objects": [
            {"kind": "object", "model": "vehicle-car", "x": -2, "z": -3, "y": 0, "rot": 90, "w": 183, "d": 462, "h": 143},
            {"kind": "object", "model": "tree-bushy", "x": 3, "z": -2, "y": 0, "rot": 0, "w": 300, "d": 300, "h": 500}]},
    ],
}
for i, o in enumerate(o for l in project["locations"] for o in l["objects"]):
    o["id"] = f"starter-object-{i + 1}"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("project.json", json.dumps({"app": "storyboard", "format": 1, "project": project}, ensure_ascii=False, indent=1))
print("boards", len(project["boards"]))
