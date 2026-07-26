#!/bin/bash
# ============================================================================
#  run_tests.sh — every harness, one command.
#
#  The v3 restructure gates each stage on "all green". Chaining a dozen
#  `node test_x.js &&` calls by hand is how a suite quietly stops being run.
#
#  Exit code is 0 only if every suite passes, so this is safe to put in front
#  of a deploy.
#
#  USAGE
#    ./run_tests.sh            all suites
#    ./run_tests.sh engine     only suites matching "engine"
# ============================================================================
set -u

cd "$(dirname "$0")" || exit 1

if [ -t 1 ]; then R='\033[0;31m'; G='\033[0;32m'; DIM='\033[2m'; N='\033[0m'
else R=''; G=''; DIM=''; N=''; fi

FILTER="${1:-}"
suites=$(ls test_*.js 2>/dev/null | sort)
[ -n "$FILTER" ] && suites=$(echo "$suites" | grep -- "$FILTER")

if [ -z "$suites" ]; then
  echo "no suites matched${FILTER:+ '$FILTER'}"; exit 1
fi

total_pass=0; total_fail=0; failed_suites=""; n=0

for f in $suites; do
  n=$((n+1))
  out=$(node "$f" 2>&1); code=$?
  # harnesses all end with "N passed, M failed"
  line=$(echo "$out" | grep -E '^[0-9]+ passed, [0-9]+ failed' | tail -1)
  p=$(echo "$line" | awk '{print $1}'); p=${p:-0}
  m=$(echo "$line" | awk '{print $3}'); m=${m:-0}
  total_pass=$((total_pass+p)); total_fail=$((total_fail+m))

  if [ $code -eq 0 ]; then
    printf "  ${G}PASS${N}  %-28s ${DIM}%4s assertions${N}\n" "$f" "$p"
  else
    printf "  ${R}FAIL${N}  %-28s ${DIM}%4s passed, %s failed${N}\n" "$f" "$p" "$m"
    failed_suites="$failed_suites $f"
    # show only the failing lines, so the summary stays readable
    echo "$out" | grep -E '^FAIL|^  FAIL' | sed 's/^/          /'
  fi
done

echo
if [ -n "$failed_suites" ]; then
  printf "${R}%d suites, %d assertions, %d FAILED${N}\n" "$n" "$((total_pass+total_fail))" "$total_fail"
  printf "  failing:%s\n" "$failed_suites"
  exit 1
fi
printf "${G}%d suites, %d assertions, 0 failures${N}\n" "$n" "$total_pass"
