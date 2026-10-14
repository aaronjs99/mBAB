#!/usr/bin/env bash
set -euo pipefail

readonly REPOSITORY="https://github.com/aaronjs99/bible-databases"
readonly ARCHIVE_URL="${REPOSITORY}/archive/refs/heads/master.zip"
readonly TARGET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/databases"

temp_dir="$(mktemp -d)"
trap 'rm -rf "${temp_dir}"' EXIT

printf 'Downloading Bible databases...\n'
curl --fail --location --silent --show-error "${ARCHIVE_URL}" --output "${temp_dir}/bible.zip"
unzip -q "${temp_dir}/bible.zip" -d "${temp_dir}"
mkdir -p "${TARGET_DIR}"
cp "${temp_dir}/bible-databases-master/DB/"*.db "${TARGET_DIR}/"
printf 'Bible databases are ready in %s\n' "${TARGET_DIR}"
