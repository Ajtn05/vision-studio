# Licensing considerations

Ultralytics software and its pretrained YOLO models are offered under AGPL-3.0 and commercial Enterprise terms. The official [license page](https://www.ultralytics.com/license) and [YOLO11 documentation](https://docs.ultralytics.com/models/yolo11/) describe these options. The headless package does not remove those obligations.

Before sharing a modified server, distributing a desktop/server bundle, or offering inference over a network, review the exact software/model licenses and the AGPL source-availability requirements. Separating the client and server does not by itself establish that a proprietary product is permitted. A qualifying commercial agreement may be needed if you cannot comply with the applicable open-source terms. Decide this before distribution with the license holder or qualified counsel as appropriate.

Model weights are downloaded explicitly on the backend computer and are not included in this repository, web client assets, or macOS bundle. Record the model source, version, and applicable terms with any deployment you distribute. Only use trusted weights; local PyTorch artifacts should be treated as executable/trusted input, not as arbitrary user uploads.

React, Vite, Tailwind, Tauri, FastAPI, OpenCV, PyTorch, OpenVINO, and transitive dependencies each retain their own licenses. Preserve required notices when redistributing. No proprietary redistribution permission or blanket project license is asserted by this scaffold; the project owner must choose a compatible license for the original code and include its text before publishing.
