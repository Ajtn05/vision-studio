from pathlib import Path

import pytest

from scripts.prepare_model import DEFAULT_VOCABULARY, read_vocabulary


def test_bundled_lvis_vocabulary_has_distinct_physical_object_labels():
    names = read_vocabulary(DEFAULT_VOCABULARY)
    assert len(names) == 1203
    assert {"person", "bus", "necktie", "screwdriver", "headset"}.issubset(names)
    assert {"community", "squeeze", "professional"}.isdisjoint(names)


@pytest.mark.parametrize("content", ["", "person\nPerson", "a" * 129, "\n".join(str(i) for i in range(2049))])
def test_unsafe_vocabulary_rejected(tmp_path: Path, content: str):
    path = tmp_path / "names.txt"
    path.write_text(content)
    with pytest.raises(ValueError):
        read_vocabulary(path)
