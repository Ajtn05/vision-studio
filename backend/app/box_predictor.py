"""Use segmentation checkpoints without the cost of constructing unused masks.

Imported only when initializing a real segmentation model, so transport tests
remain independent of Ultralytics and PyTorch.
"""

from ultralytics.models.yolo.detect import DetectionPredictor
from ultralytics.models.yolo.segment import SegmentationPredictor


class BoxesOnlySegmentationPredictor(SegmentationPredictor):
    def construct_result(self, pred, img, orig_img, img_path, proto):
        return DetectionPredictor.construct_result(self, pred, img, orig_img, img_path)
