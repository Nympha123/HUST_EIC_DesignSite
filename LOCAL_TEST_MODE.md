# Local Test Mode

The ignored `.local-test-mode` marker enables local data for development without contacting CloudBase.

- Performance, materials, and past-works directories and records are stored independently in `data/local-test/`.
- The first performance request creates a sample directory and a 20-row performance page with the default task columns.
- Performance data is stored in `performance-directories.json` and `performance-records.json`.
- Uploaded test files are stored under `data/local-test/storage/`.
- Local uploads are limited to 256 MB per file.
- Remove `.local-test-mode` and restart `npm.cmd run dev` to return to CloudBase.
- This mode is disabled automatically for production builds and servers.
