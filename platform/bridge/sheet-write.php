<?php
// PHP CLI bridge for writing CREATOR_DB. Called by the v2 Node app (lib/sheet/bridge.ts), JSON on stdin → JSON on stdout.
// Reuses the live app's own Google gateway and the SAME lock file as PHP write-back.php (sheet-write.lock), so v2 and
// the old app never write at the same moment, and flushes the old app's 15 s Sheet cache after a write.
//
// ops:
//   read   {row}                                  → {header, values[], links{}, formulaCols[]} for one Sheet row
//   update {row, name, expect{Col:raw}, set{Col}}  → re-checks the row's name and that every target cell still holds
//                                                    `expect` (else conflict), never writes a formula cell, writes RAW
//   create {values{Col}, links{platform:url}}      → refuses a taken name or a profile URL already on the Sheet
//                                                    (quarantined rows included), appends RAW, link cells as HYPERLINK
// Overrides for the test copy: MKV2_SHEET_ID, MKV2_PHP_STATE_DIR (separate identity state, never the live db.json).
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('MKP', 1);
if (getenv('MKV2_SHEET_ID')) define('MKP_SHEET_ID', getenv('MKV2_SHEET_ID'));
if (getenv('MKV2_PHP_STATE_DIR')) define('MKP_STATE_DIR', getenv('MKV2_PHP_STATE_DIR'));
$root = getenv('MKP_PHP_ROOT') ?: '/home/thestvco/booking.markus.agency';
require $root . '/_mk/core.php';
require_once $root . '/_mk/auth.php';
require_once $root . '/_mk/shared.php';

const TAB = 'CREATOR_DB';
const HEADER_ROW = 3;
// Columns v2 may change on an existing row. Creator_Name and the channel link cells are NOT here: the old app binds
// creator identity (uid) through them. Age / Age_Band / STT are formulas or system values.
const EDITABLE = ['Tier', 'Primary_Category', 'Secondary_Category', 'Creator_Type', 'Casting_Profile', 'Year_Of_Birth',
    'Base_Location', 'Representation', 'Contact_Person', 'Contact_Channel', 'Contact_Detail', 'Company_Email', 'Company_Phone',
    'Company_Website', 'Personal_Email', 'Personal_Phone', 'Note', 'Hero_Platform', 'Sub_TikTok', 'Sub_Facebook', 'Sub_IG',
    'Sub_Youtube', 'Relationship_Status', 'Photo Post', 'Video Post', 'Tham gia sự kiện', 'Tham gia video của nhãn hàng', 'Livestream'];
const NUMERIC = ['Year_Of_Birth', 'Sub_TikTok', 'Sub_Facebook', 'Sub_IG', 'Sub_Youtube'];
const LINK_COL = ['tiktok' => 'TikTok', 'facebook' => 'Facebook', 'instagram' => 'Instagram', 'youtube' => 'Youtube', 'threads' => 'Threads'];

function out($a) { fwrite(STDOUT, json_encode($a, JSON_UNESCAPED_UNICODE)); exit(0); }
function bad($code, $extra = []) { out(array_merge(['ok' => false, 'error' => $code], $extra)); }
function call_api($method, $url, $write, $body = null)
{
    static $m = null;
    $gw = mk_gateway();
    if (!$m) { $m = new ReflectionMethod($gw, 'call'); $m->setAccessible(true); }
    return $m->invoke($gw, $method, $url, $write, $body);
}
function base_url() { return 'https://sheets.googleapis.com/v4/spreadsheets/' . MKP_SHEET_ID; }
function col_letter($i) { $s = ''; $i = (int)$i; while ($i >= 0) { $s = chr(65 + $i % 26) . $s; $i = intdiv($i, 26) - 1; } return $s; }
function clean_val($v)
{
    if ($v === null) return '';
    if (is_int($v) || is_float($v)) return $v;
    if (!is_string($v) || mb_strlen($v, 'UTF-8') > 2000 || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $v)) bad('bad_value');
    return $v;
}
function typed($col, $v)
{
    $v = clean_val($v);
    if (in_array($col, NUMERIC, true) && is_string($v) && preg_match('/^\d{1,12}$/', trim($v))) return (int)trim($v);
    return $v;
}
function lock()
{
    $fh = fopen(sh_data_dir() . '/sheet-write.lock', 'c');
    if (!$fh) bad('lock_unavailable');
    flock($fh, LOCK_EX);
    return $fh;
}
// Header (sheet row 3) + one row, with entered values, formatted values and hyperlinks.
function read_row($row)
{
    $fields = 'sheets(data(startRow,rowData(values(userEnteredValue,formattedValue,hyperlink))))';
    $url = base_url() . '?includeGridData=true&ranges=' . rawurlencode(TAB . '!A' . HEADER_ROW . ':BF' . HEADER_ROW)
        . '&ranges=' . rawurlencode(TAB . '!A' . $row . ':BF' . $row) . '&fields=' . rawurlencode($fields);
    $d = call_api('GET', $url, false);
    $data = isset($d['sheets'][0]['data']) ? $d['sheets'][0]['data'] : [];
    $hv = isset($data[0]['rowData'][0]['values']) ? $data[0]['rowData'][0]['values'] : [];
    $rv = isset($data[1]['rowData'][0]['values']) ? $data[1]['rowData'][0]['values'] : [];
    $header = [];
    foreach ($hv as $c) $header[] = trim(isset($c['formattedValue']) ? (string)$c['formattedValue'] : '');
    $values = [];
    $formulaCols = [];
    $hyper = [];
    foreach ($header as $i => $h) {
        $c = isset($rv[$i]) ? $rv[$i] : [];
        $values[] = isset($c['formattedValue']) ? (string)$c['formattedValue'] : '';
        if (isset($c['userEnteredValue']['formulaValue'])) $formulaCols[] = $h;
        $hyper[] = isset($c['hyperlink']) ? (string)$c['hyperlink'] : null;
    }
    $links = [];
    foreach (LINK_COL as $p => $col) { $i = array_search($col, $header, true); $links[$p] = $i === false ? null : $hyper[$i]; }
    return [$header, $values, $links, $formulaCols];
}

$in = json_decode((string)stream_get_contents(STDIN), true);
if (!is_array($in) || empty($in['op'])) bad('bad_request');

try {
    if ($in['op'] === 'read') {
        $row = (int)(isset($in['row']) ? $in['row'] : 0);
        if ($row <= HEADER_ROW) bad('bad_row');
        list($header, $values, $links, $formulaCols) = read_row($row);
        out(['ok' => true, 'header' => $header, 'values' => $values, 'links' => $links, 'formulaCols' => $formulaCols]);
    }

    if ($in['op'] === 'update') {
        $row = (int)(isset($in['row']) ? $in['row'] : 0);
        $set = isset($in['set']) && is_array($in['set']) ? $in['set'] : [];
        $expect = isset($in['expect']) && is_array($in['expect']) ? $in['expect'] : [];
        if ($row <= HEADER_ROW || !$set) bad('bad_request');
        $lk = lock();
        try {
            list($header, $values, , $formulaCols) = read_row($row);
            $nameCol = array_search('Creator_Name', $header, true);
            if ($nameCol === false) bad('sheet_layout_changed');
            if (sh_norm_name($values[$nameCol]) !== sh_norm_name(isset($in['name']) ? $in['name'] : '')) bad('row_moved');
            $data = [];
            $conflicts = [];
            foreach ($set as $col => $val) {
                if (!in_array($col, EDITABLE, true)) bad('column_not_editable', ['column' => $col]);
                $i = array_search($col, $header, true);
                if ($i === false) bad('column_missing', ['column' => $col]);
                if (in_array($col, $formulaCols, true)) bad('formula_cell', ['column' => $col]);
                $cur = trim(preg_replace('/\s+/u', ' ', $values[$i]));
                $exp = trim(preg_replace('/\s+/u', ' ', (string)(isset($expect[$col]) ? $expect[$col] : '')));
                if ($cur !== $exp) { $conflicts[] = ['column' => $col, 'current' => $values[$i]]; continue; }
                $data[] = ['range' => TAB . '!' . col_letter($i) . $row, 'values' => [[typed($col, $val)]]];
            }
            if ($conflicts) bad('conflict', ['conflicts' => $conflicts]);
            call_api('POST', base_url() . '/values:batchUpdate', true, ['valueInputOption' => 'RAW', 'data' => $data]);
            mk_sheet_flush();
            out(['ok' => true, 'row' => $row, 'written' => array_keys($set)]);
        } finally {
            flock($lk, LOCK_UN);
            fclose($lk);
        }
    }

    if ($in['op'] === 'create') {
        $vals = isset($in['values']) && is_array($in['values']) ? $in['values'] : [];
        $links = isset($in['links']) && is_array($in['links']) ? $in['links'] : [];
        $name = trim((string)(isset($vals['Creator_Name']) ? $vals['Creator_Name'] : ''));
        if ($name === '' || preg_match('/[\r\n]/', $name) || mb_strlen($name, 'UTF-8') > 190) bad('bad_name');
        $newUrls = [];
        foreach ($links as $p => $u) {
            if (!isset(LINK_COL[$p]) || $u === null || $u === '') continue;
            $n = sh_valid_profile_url($u);
            if ($n === '' || preg_match('/["\s]/', (string)$u)) bad('bad_link', ['platform' => $p]);
            $newUrls[$p] = $n;
        }
        if (!$newUrls) bad('link_required');
        foreach ($vals as $col => $v) if ($col !== 'Creator_Name' && !in_array($col, EDITABLE, true)) bad('column_not_editable', ['column' => $col]);
        $lk = lock();
        try {
            $sheet = mk_gateway()->syncRead(); // fresh read (no cache): every row incl. quarantined ones
            $header = array_map(function ($h) { return trim((string)$h); }, $sheet['header']);
            $nameCol = array_search('Creator_Name', $header, true);
            if ($nameCol === false) bad('sheet_layout_changed');
            $maxStt = 0;
            foreach ($sheet['rows'] as $i => $r) {
                if (sh_norm_name(isset($r[$nameCol]) ? $r[$nameCol] : '') === sh_norm_name($name)) bad('name_taken', ['row' => $i + 4]);
                $fp = sh_row_fp($r, isset($sheet['links'][$i]) ? $sheet['links'][$i] : null);
                $hit = array_intersect($fp['urls'], array_values($newUrls));
                if ($hit) bad('url_taken', ['row' => $i + 4, 'name' => $fp['display']]);
                if (isset($r[0]) && preg_match('/^\d+$/', trim($r[0]))) $maxStt = max($maxStt, (int)trim($r[0]));
            }
            $rowVals = array_fill(0, count($header), '');
            $sttCol = array_search('STT', $header, true);
            if ($sttCol !== false) $rowVals[$sttCol] = $maxStt + 1;
            foreach ($vals as $col => $v) { $i = array_search($col, $header, true); if ($i === false) bad('column_missing', ['column' => $col]); $rowVals[$i] = typed($col, $v); }
            $r = call_api('POST', base_url() . '/values/' . rawurlencode(TAB . '!A' . HEADER_ROW . ':BF3000') . ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', true, ['values' => [$rowVals]]);
            $range = isset($r['updates']['updatedRange']) ? $r['updates']['updatedRange'] : '';
            if (!preg_match('/!A(\d+):/', $range, $m)) bad('append_unknown_row');
            $row = (int)$m[1];
            // Link cells exactly like existing rows: =HYPERLINK("url","label"). The URL was validated above (no quotes or
            // spaces); the label is the handle with quotes removed. USER_ENTERED only for these cells.
            $data = [];
            foreach ($newUrls as $p => $n) {
                $i = array_search(LINK_COL[$p], $header, true);
                if ($i === false) continue;
                $url = trim((string)$links[$p]);
                $label = preg_replace('/["\r\n]/', '', isset($in['labels'][$p]) ? (string)$in['labels'][$p] : $url);
                $data[] = ['range' => TAB . '!' . col_letter($i) . $row, 'values' => [['=HYPERLINK("' . $url . '","' . $label . '")']]];
            }
            if ($data) call_api('POST', base_url() . '/values:batchUpdate', true, ['valueInputOption' => 'USER_ENTERED', 'data' => $data]);
            mk_sheet_flush();
            out(['ok' => true, 'row' => $row]);
        } finally {
            flock($lk, LOCK_UN);
            fclose($lk);
        }
    }
    bad('unknown_op');
} catch (Throwable $e) {
    out(['ok' => false, 'error' => ($e instanceof ShHttp) ? $e->errCode : 'bridge_failed']);
}
