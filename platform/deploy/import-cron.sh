#!/bin/bash
# Cron (every 15 min, on the host): Google Sheet CREATOR_DB → MariaDB of /v2.
# Installed copy: ~/markus-v2-state/import-cron.sh (outside the app dir, so deploys do not touch it).
#   */15 * * * * /bin/bash /home/thestvco/markus-v2-state/import-cron.sh
# - flock: a slow run is never overlapped by the next one.
# - The log holds counts and error codes only (the importer never prints names, phones or e-mails); last 2000 lines kept.
# - Each run also writes a row to sync_runs in the database.
set -u
H=/home/thestvco
S=$H/markus-v2-state
LOG=$S/import.log
cd $H/markus-v2-app || exit 1
exec 9>$S/import.lock
/usr/bin/flock -n 9 || exit 0
{
  printf '%s ' "$(date '+%Y-%m-%d %H:%M:%S')"
  /usr/local/bin/php bridge/sheet-export.php | $H/nodevenv/markus-v2-app/22/bin/node dist/import-sheet.cjs
} >>$LOG 2>&1
tail -n 2000 $LOG >$LOG.tmp 2>/dev/null && mv $LOG.tmp $LOG
chmod 600 $LOG
