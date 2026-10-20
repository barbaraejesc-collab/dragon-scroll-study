# Project rules
- Phrase corrections are in-place data updates keyed by card ID; preserve study history and saved queues.
- Keep an explicit learned-word segmentation fixture and lexical-compound audit in `scripts/phrase-audit`; character membership alone cannot validate Mandarin vocabulary.
- Audit scripts run locally only and must not be imported into the application runtime.