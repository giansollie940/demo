R6.6.2 CI portability hotfix

Changes only static tests:
- Replaces external ImageMagick `identify` call with pure Node PNG IHDR parsing.
- Adds a regression preventing static tests from depending on global ImageMagick.

No Vue, CSS, image asset, database, or Edge Function source is changed.
