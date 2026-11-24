<?php
// PHP CLI bridge: the CREATOR_DB snapshot exactly as the old app sees it, with the old app's creator uids.
// Runs ONLY from the command line on the host and is piped straight into the Node importer, so creator data never
// leaves the server:   php bridge/sheet-export.php | node dist/import-sheet.cjs [--dry-run]
// Uses the live app's own code (same Sheet read, same identity reconcile, same db.json lock) — nothing is re-implemented.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('MKP', 1);
if (getenv('MKV2_SHEET_ID')) define('MKP_SHEET_ID', getenv('MKV2_SHEET_ID')); // test copy
if (getenv('MKV2_PHP_STATE_DIR')) define('MKP_STATE_DIR', getenv('MKV2_PHP_STATE_DIR')); // its own identity state, never the live db.json
$root = getenv('MKP_PHP_ROOT') ?: '/home/thestvco/booking.markus.agency';
require $root . '/_mk/core.php';
require_once $root . '/_mk/auth.php';
require_once $root . '/_mk/shared.php';

try {
    $out = sh_tx(true, function (&$db) {
        list($sheet, $res) = sh_reconciled($db);
        $n = count($sheet['rows']);
        $uids = array_fill(0, $n, null);
        $statuses = array_fill(0, $n, null);
        $deleted = array_fill(0, $n, false);
        foreach ($res as $r) {
            $i = $r['index'];
            $uids[$i] = $r['uid'];
            $statuses[$i] = $r['status'] === 'quarantine' ? 'quarantine:' . (isset($r['reason']) ? $r['reason'] : '') : $r['status'];
            if ($r['uid'] && sh_ext_get($db, $r['uid'])['deleted']) $deleted[$i] = true;
        }
        return ['header' => $sheet['header'], 'rows' => $sheet['rows'], 'links' => $sheet['links'], 'uids' => $uids,
            'statuses' => $statuses, 'deleted' => $deleted, 'updatedAt' => isset($sheet['updatedAt']) ? $sheet['updatedAt'] : null];
    });
    fwrite(STDOUT, json_encode($out, JSON_UNESCAPED_UNICODE));
} catch (Throwable $e) {
    fwrite(STDERR, 'bridge failed: ' . (($e instanceof ShHttp) ? $e->errCode : get_class($e)) . "\n");
    exit(1);
}
