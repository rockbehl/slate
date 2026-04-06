/* ─────────────────────────────────────────────────
   SLATE — prep-reel.js
   Phase 5: One-time preprocessing script.
   Converts screenplay.pdf into structured scene JSON
   for Reel mode.

   HOW TO RUN (when you're ready for Reel mode):
     node reel/prep-reel.js

   DEPENDENCIES:
     npm install pdf-parse
     npm install @anthropic-ai/sdk  (optional: AI scene detection)

   OUTPUT:
     reel/reel-data.json — structured scene objects ready
     for the Reel mode renderer to consume.

   OUTPUT FORMAT:
   {
     "title": "SCREENPLAY TITLE",
     "scenes": [
       {
         "id":       "scene-001",
         "heading":  "INT. EVIDENCE ROOM — NIGHT",
         "type":     "INT",
         "location": "EVIDENCE ROOM",
         "time":     "NIGHT",
         "pageStart": 12,
         "pageEnd":   14,
         "text":     "Full scene text...",
         "cue":      { ...matching entry from cues.json }
       }
     ]
   }
───────────────────────────────────────────────── */

// TODO Phase 5 — implement this script when Reel mode is ready.
// The scaffold is intentionally left as a stub.
// The data model above is documented and ready to build against.

console.log('SLATE prep-reel.js — Phase 5 stub. Not yet implemented.');
