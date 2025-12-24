#!/usr/bin/env bash
set -euo pipefail

redis-server --save "" --appendonly no
