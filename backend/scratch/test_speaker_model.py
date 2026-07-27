print("Importing torch...")
try:
    import torch
    print("torch imported. version:", torch.__version__)
except Exception as e:
    print("torch failed:", e)

print("Importing torchaudio...")
try:
    import torchaudio
    print("torchaudio imported.")
except Exception as e:
    print("torchaudio failed:", e)

print("Importing speechbrain...")
try:
    import speechbrain
    print("speechbrain imported.")
except Exception as e:
    print("speechbrain failed:", e)
