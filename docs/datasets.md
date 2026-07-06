# NILM Dataset Workflow

VoltPulse keeps full public NILM datasets out of git. Raw archives are large,
often require manual access or citation terms, and should live only in local
developer storage.

## Folder Layout

```text
data/raw/uk-dale/
data/raw/redd/
data/raw/refit/
data/processed/
data/exports/
data/samples/
```

- `data/raw/` stores manually downloaded dataset files.
- `data/processed/` stores unified CSV files generated from raw data.
- `data/processed/*_sample.csv` stores tiny processed CSV samples for the
  dashboard's live analysis view.
- `data/exports/` stores local reports or one-off analysis outputs.
- `data/samples/` stores tiny committed samples used by tests and demos.

## Dataset Library

The backend exposes a dataset library under `/nilm/lab/datasets` for UK-DALE,
REDD, and REFIT. It reports expected paths, local file status, file counts,
total size, supported houses/appliances, import commands, access notes, and
known limitations.

Useful endpoints:

```text
GET  /nilm/lab/datasets
GET  /nilm/lab/datasets/{dataset_id}
GET  /nilm/lab/datasets/{dataset_id}/files
GET  /nilm/lab/datasets/{dataset_id}/profile
GET  /nilm/lab/datasets/{dataset_id}/download-guide
POST /nilm/lab/datasets/{dataset_id}/convert
```

The profile endpoint samples CSV files instead of loading huge files fully into
memory. CSV profiling detects timestamp, power, current, voltage, and appliance
columns; returns row/column counts, preview rows, numeric summaries, missing
values, and time ranges. HDF5 profiling returns groups, datasets, shapes, and
dtypes when `h5py` is installed.

If full raw files are not available, the site profiles the committed processed
sample CSV for that dataset. The UI marks these as samples so they are not
confused with a full converted house.

## UK-DALE

1. Open the official UK-DALE data page: <https://jack-kelly.com/data/>.
2. Review the current access and redistribution terms.
3. Download the low-frequency house data outside git.
4. Extract a house to `data/raw/uk-dale/house_1/`.
5. Convert to the unified CSV schema:

```bash
cd backend
python -m app.tools.convert_uk_dale \
  --raw-house-dir ../data/raw/uk-dale/house_1 \
  --output ../data/processed/uk_dale_house_1.csv \
  --appliance-channel kettle=10 \
  --appliance-channel fridge=12
```

Check the real UK-DALE channel mapping before conversion; channels differ by
house.

## REDD

1. Open the REDD project page: <http://redd.csail.mit.edu/>.
2. Follow the current manual access instructions.
3. Store raw files under `data/raw/redd/`.
4. Do not commit raw REDD archives.

REDD metadata and file browsing are implemented. A production converter is still
scaffolded until real raw files and house/channel mappings are available.

## REFIT

1. Open the REFIT data portal:
   <https://pureportal.strath.ac.uk/en/datasets/refit-electrical-load-measurements>.
2. Follow the portal's current download and citation instructions.
3. Store CSV files under `data/raw/refit/`.
4. Keep raw files out of git.

REFIT metadata and file browsing are implemented. A production converter is
still scaffolded.

## Verifying Dashboard Readiness

1. Put raw files under the dataset's expected `data/raw/...` folder.
2. Run the conversion command when a converter exists.
3. Start the stack with `docker compose up --build`.
4. Open the frontend at <http://127.0.0.1:5173>.
5. Open NILM Lab, select Datasets, then click the dataset.
6. Check the badges for `raw ready`, `processed ready`, or `needs conversion`.
7. Open the Analysis tab to watch the live dataset profile refresh on the site.
8. Use View files and profile individual CSV or HDF5 files.

## Implemented Now

- Centralized metadata for UK-DALE, REDD, and REFIT.
- Dataset inventory, file browser, profile, download guide, and conversion
  command endpoints.
- CSV and HDF5 profiling with explicit limits.
- Live frontend dataset analysis that refreshes profile results while the
  Analysis tab is open.
- UK-DALE unified CSV converter.
- Tiny processed CSV samples for UK-DALE, REDD, and REFIT.
- Tiny UK-DALE-style sample for the NILM Lab baseline demo.

## Scaffolded

- REDD production converter.
- REFIT production converter.
- Saved experiment runs, model registry, and online multi-appliance inference.
- Automatic dataset download for sources requiring registration or manual
  portal access.
