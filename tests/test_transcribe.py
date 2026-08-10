from pathlib import Path

from vid2skill import transcribe


class _FakeSegment:
    def __init__(self, text):
        self.text = text


class _FakeWhisperModel:
    instances = 0

    def __init__(self, model_size, device, compute_type):
        _FakeWhisperModel.instances += 1
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type

    def transcribe(self, path):
        return [_FakeSegment(" Hello world. "), _FakeSegment("Second line.")], None


def test_transcribe_audio_joins_segment_text(monkeypatch):
    monkeypatch.setattr("faster_whisper.WhisperModel", _FakeWhisperModel)
    transcribe._model_cache.clear()

    text = transcribe.transcribe_audio(Path("fake.wav"))

    assert text == "Hello world. Second line."


def test_transcribe_audio_reuses_cached_model(monkeypatch):
    monkeypatch.setattr("faster_whisper.WhisperModel", _FakeWhisperModel)
    transcribe._model_cache.clear()
    _FakeWhisperModel.instances = 0

    transcribe.transcribe_audio(Path("a.wav"), model_size="base")
    transcribe.transcribe_audio(Path("b.wav"), model_size="base")

    assert _FakeWhisperModel.instances == 1
