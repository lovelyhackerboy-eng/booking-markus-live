<?php
// PHP CLI (host only): full backup of the CREATOR_DB tab — every cell's entered value (formulas kept as formulas),
// formatted value and hyperlink — to a private JSON file in the v2 state dir. Prints the file name and counts only.
//   php bridge/sheet-backup.php            (real Sheet)
//   MKV2_SHEET_ID=<copy id> php bridge/sheet-backup.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('MKP', 1);
if (getenv('MKV2_SHEET_ID')) define('MKP_SHEET_ID', getenv('MKV2_SHEET_ID'));
$root = getenv('MKP_PHP_ROOT') ?: '/home/thestvco/booking.markus.agency';
require $root . '/_mk/core.php';
require_once $root . '/_mk/auth.php';
require_once $root . '/_mk/shared.php';

$gw = mk_gateway();
$call = new ReflectionMethod($gw, 'call');
$call->setAccessible(true);
$fields = 'properties(title),sheets(properties(title,sheetId),data(startRow,rowData(values(userEnteredValue,formattedValue,hyperlink))))';
$url = 'https://sheets.googleapis.com/v4/spreadsheets/' . MKP_SHEET_ID . '?includeGridData=true&ranges=' . rawurlencode('CREATOR_DB!A1:BF3000') . '&fields=' . rawurlencode($fields);
$d = $call->invoke($gw, 'GET', $url, false);
$rows = isset($d['sheets'][0]['data'][0]['rowData']) ? $d['sheets'][0]['data'][0]['rowData'] : [];
$dir = getenv('MKV2_STATE_DIR') ?: '/home/thestvco/markus-v2-state';
$file = $dir . '/sheet-backup-' . date('Ymd-His') . (getenv('MKV2_SHEET_ID') ? '-copy' : '') . '.json';
$old = umask(077);
file_put_contents($file, json_encode(['sheetId' => MKP_SHEET_ID, 'at' => date('c'), 'range' => 'CREATOR_DB!A1:BF3000', 'rowData' => $rows], JSON_UNESCAPED_UNICODE));
umask($old);
$cells = 0;
$formulas = 0;
foreach ($rows as $r) foreach (isset($r['values']) ? $r['values'] : [] as $c) {
    if (isset($c['userEnteredValue'])) $cells++;
    if (isset($c['userEnteredValue']['formulaValue'])) $formulas++;
}
echo json_encode(['ok' => true, 'file' => basename($file), 'rows' => count($rows), 'cells' => $cells, 'formulas' => $formulas, 'bytes' => filesize($file)]), "\n";
