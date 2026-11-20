# Runs ON THE HOST (ssh … 'bash -s' < deploy/host-deploy.sh) after v2-app.tar.gz / v2-deps.tar.gz / BUILD_ID were copied
# to ~/markus-v2-state/. Backs up, replaces app + deps with 755/644 permissions, migrates, restarts, and verifies the new
# build is the one being served. Set DEPS=0 to keep the current node_modules.
set -eu
umask 022
H=/home/thestvco
A=$H/markus-v2-app
L=$H/nodevenv/markus-v2-app/22/lib/node_modules
S=$H/markus-v2-state
TS=$(date +%Y%m%d-%H%M%S)
test -f $S/v2-app.tar.gz && test -f $S/v2-deps.tar.gz && test -f $S/BUILD_ID
WANT=$(cat $S/BUILD_ID)

tar -C $H -czf $S/app-backup-$TS.tgz --exclude=markus-v2-app/node_modules markus-v2-app
[ "${DEPS:-1}" = 1 ] && tar -C $L -czf $S/deps-backup-$TS.tgz .
ls -1t $S/app-backup-*.tgz | tail -n +4 | xargs -r rm -f   # keep the last 3
ls -1t $S/deps-backup-*.tgz 2>/dev/null | tail -n +4 | xargs -r rm -f
echo "backup: app-backup-$TS.tgz"

rm -rf $A/.next $A/server.js $A/start.cjs $A/package.json $A/drizzle $A/dist $A/bridge $A/public
tar -C $A -xzf $S/v2-app.tar.gz
if [ "${DEPS:-1}" = 1 ]; then
  find $L -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  tar -C $L -xzf $S/v2-deps.tar.gz
fi
for d in $A $L; do find "$d" -path "$d/node_modules" -prune -o -type d -exec chmod 755 {} + ; find "$d" -path "$d/node_modules" -prune -o -type f -exec chmod 644 {} + ; done
chmod 600 $S/runtime.env
mkdir -p $A/tmp

$H/nodevenv/markus-v2-app/22/bin/node $A/dist/migrate.cjs
touch $A/tmp/restart.txt
cloudlinux-selector restart --json --interpreter nodejs --app-root markus-v2-app >/dev/null
rm -f $S/v2-app.tar.gz $S/v2-deps.tar.gz

sleep 2
code=$(curl -s -o /dev/null -w '%{http_code}' https://booking.markus.agency/v2/api/auth/session)
got=$(curl -s https://booking.markus.agency/v2/api/version | sed -n 's/.*"build":"\([^"]*\)".*/\1/p')
echo "session=$code build=$got want=$WANT"
[ "$code" = 401 ] && [ "$got" = "$WANT" ] && echo DEPLOY_OK || { echo DEPLOY_CHECK_FAILED; exit 1; }
