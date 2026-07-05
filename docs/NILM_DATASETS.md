# NILM Dataset Layer

VoltPulse uses public NILM datasets to move from telemetry visualization toward
appliance-level energy disaggregation.

## Unified Format

Every loader should produce the same internal CSV shape:

```csv
timestamp,aggregate_power_w,fridge_w,kettle_w,washing_machine_w,dishwasher_w,microwave_w
2026-01-01T12:00:00Z,840,120,700,0,0,0
2026-01-01T12:00:08Z,850,125,705,0,0,0
2026-01-01T12:00:16Z,145,130,0,0,0,0
```

The canonical Python representation is `app.ml.datasets.schema.UnifiedNILMRow`.
Processed files belong in `data/processed/`; raw downloaded datasets stay in
`data/raw/` and should not be committed.

Small, reviewable demo samples may be committed under `data/samples/`. The first
sample is `data/samples/uk_dale_house_1_sample.csv`, mirrored inside the backend
package so the Dockerized API can serve NILM Lab without mounting the repository
root.

## Local Download Layout

Large public datasets should be copied or moved into the ignored `data/raw/`
tree. Do not commit full `.csv`, `.h5`, `.npy`, or archive downloads.

If the files were downloaded by Safari into `~/Downloads/`, use
one of these approaches.

Copy files, keeping the originals in Downloads:

```bash
mkdir -p data/raw/uk-dale data/raw/redd data/raw/refit data/raw/iawe
cp ~/Downloads/downloads_safari/CLEAN_House*.csv data/raw/refit/
cp ~/Downloads/downloads_safari/ukdale.h5 data/raw/uk-dale/
cp ~/Downloads/downloads_safari/redd.h5 data/raw/redd/
cp ~/Downloads/downloads_safari/iawe.h5 data/raw/iawe/
```

Move files, saving disk space but removing them from Downloads:

```bash
mkdir -p data/raw/uk-dale data/raw/redd data/raw/refit data/raw/iawe
mv ~/Downloads/downloads_safari/CLEAN_House*.csv data/raw/refit/
mv ~/Downloads/downloads_safari/ukdale.h5 data/raw/uk-dale/
mv ~/Downloads/downloads_safari/redd.h5 data/raw/redd/
mv ~/Downloads/downloads_safari/iawe.h5 data/raw/iawe/
```

The dashboard Dataset Library marks a dataset as `ready` only when the expected
local raw, processed, or sample paths exist. A downloaded file still appears as
`missing` until it is placed under the project `data/` tree or converted into
`data/processed/`.

## Dataset Priority

### 1. UK-DALE

UK-DALE is the first target because it contains whole-house aggregate demand and
appliance-level ground truth for multiple homes. It is a good MVP dataset for:

- kettle disaggregation
- fridge compressor cycles
- washing machine and dishwasher events
- sequence-to-point experiments

Initial loader:

- `backend/app/ml/datasets/uk_dale_loader.py`
- expects low-frequency channel files such as `mains.dat` and `channel_10.dat`
- aligns appliance channels by timestamp

Conversion command:

```bash
PYTHONPATH=backend .venv/bin/python -m app.tools.convert_uk_dale \
  --raw-house-dir data/raw/uk-dale/house_1 \
  --output data/processed/uk_dale_house_1.csv
```

Reference: <https://arxiv.org/abs/1404.0284>

### 2. REDD

REDD is useful for comparison with older NILM literature and benchmark papers.
The current loader keeps the same channel-file strategy as UK-DALE, because the
low-frequency REDD layout is similar enough for a first conversion pass.

Initial loader:

- `backend/app/ml/datasets/redd_loader.py`
- produces the same unified rows

### 3. REFIT

REFIT is useful for low-frequency smart-meter scenarios and longer residential
records. The first loader accepts a CSV column map so individual house files can
be normalized without a heavy dependency on pandas.

Initial loader:

- `backend/app/ml/datasets/refit_loader.py`
- default sample period: 8 seconds

Reference: <https://arxiv.org/abs/2104.07809>

## Next Dataset Tasks

- Add dataset-specific README files under `data/raw/` with download and license
  notes.
- Add small synthetic sample CSVs under `data/samples/` for dashboard demos.
- Add channel maps for all UK-DALE houses.
- Validate clock alignment and missing appliance values during conversion.
- Store conversion metadata next to each processed file.
