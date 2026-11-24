#!/bin/bash
# Cron (hourly, on the host): YouTube metrics + campaign post auto-tracking for /v2.
# Installed copy: ~/markus-v2-state/metrics-cron.sh (outside the app dir, so deploys do not touch it).
#   17 * * * * /bin/bash /home/thestvco/markus-v2-state/metrics-cron.sh
# flock against overlap; the log holds counts and error codes only; last 2000 lines kept.
set -u
H=/home/thestvco
S=$H/markus-v2-state
LOG=$S/metrics.log
cd $H/markus-v2-app || exit 1
exec 9>$S/metrics.lock
/usr/bin/flock -n 9 || exit 0
{
  printf '%s ' "$(date '+%Y-%m-%d %H:%M:%S')"
  $H/nodevenv/markus-v2-app/22/bin/node dist/metrics-cron.cjs --batch=25
} >>$LOG 2>&1
tail -n 2000 $LOG >$LOG.tmp 2>/dev/null && mv $LOG.tmp $LOG
chmod 600 $LOG
