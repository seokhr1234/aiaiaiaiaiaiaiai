# Seoul OSM reference walking graph

This is a derived OpenStreetMap database under **ODbL-1.0**, attributed to
[OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
Source: [Geofabrik South Korea](https://download.geofabrik.de/asia/south-korea.html),
snapshot `2026-11-09T21:22:17Z`, collected `2026-11-11`, prepared `2026-11-13`.

The complete distributed derivative is `assets/graph.bin.gz`,
`assets/ways.json.gz` and `manifest.json`. The manifest supplies byte offsets,
lengths and types for little-endian, eight-byte-aligned arrays in the decompressed
binary: `d` Float64, `I` Uint32, `B` Uint8, `f` Float32. Coordinates are longitude,
latitude in EPSG:4326; original OSM node IDs are stored exactly as Float64.
Each way row contains ID, name, object timestamp, highway type, raw incline tag
and the original foot-tag claim. `building-exclusions.json.gz` preserves the
additional withheld `(way ID, segment index)` records.

Routing reparses numeric incline tags from their original strings to avoid
Float32 rounding weakening a requested ceiling. Missing incline remains missing.
The manifest and both runtime assets are registered by SHA-256 in the parent
`service-integrity.json`; runtime corruption fails closed.

This graph provides **registered-road reference routes**, not verified accessible
pedestrian guidance. Building-interior intersections and unresolved structures,
access conditions and barriers are withheld. No coordinate snapping or invented
crossings join the graph. Endpoint gaps, actual access, sidewalk side, curb,
width, grade and operating status remain unverified. Rest routing and city-wide
GPS guidance are unavailable. Existing research records and the original detailed
walking datasets remain unchanged.

Preparation and independent verification live in `../../scripts/prepare-city-walk.py`,
`../../scripts/verify-city-walk.py` and `../../scripts/verify-city-buildings.py`.
See [the implementation and validation record](../../docs/city-walk-2026-11-13.md).
