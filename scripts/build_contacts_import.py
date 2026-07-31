import pandas as pd, json, re

cus = pd.DataFrame(json.load(open("/tmp/customers.json")))
df = pd.read_excel("/home/ubuntu/upload/Contactsall.xlsx", sheet_name="Print")

SUFFIX = r'\b(S\.?A\.?|A\.?E\.?|LTD|LIMITED|INC|CORP|CORPORATION|CO|PTE|LLC|GMBH|BV|NV|WLL|PLC|EPE|OE|IKE)\b'
def norm(s):
    if s is None or pd.isna(s): return ""
    s = str(s).upper()
    s = re.sub(SUFFIX, '', s)
    return re.sub(r'[^A-Z0-9\u0370-\u03FF]', '', s)

cus['nn'] = cus['name'].map(norm)
cus['grp'] = cus.apply(lambda r: (r['group'] or '').strip() or r['name'], axis=1)
cus['gn'] = cus['grp'].map(norm)

cmap = {}
for _, r in cus.iterrows():
    cmap.setdefault(r['nn'], (int(r['id']), r['name'], r['grp'], 'company'))
gmap = {}
for g, sub in cus.groupby('gn'):
    same = sub[sub['nn'] == g]
    rep = same.iloc[0] if len(same) else sub.iloc[0]
    gmap.setdefault(g, (int(rep['id']), rep['name'], rep['grp'], 'group'))

EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$')
def emails(r):
    out = []
    for col in ['email.1', 'email']:
        v = r[col]
        if v is None or pd.isna(v): continue
        for p in re.split(r'[;,]', str(v)):
            p = p.strip().lower()
            if EMAIL_RE.match(p) and p not in out:
                out.append(p)
    return out

def full_name(r):
    sn = "" if pd.isna(r['Surname']) else str(r['Surname']).strip()
    fn = "" if pd.isna(r['Name']) else str(r['Name']).strip()
    nm = re.sub(r'\s+', ' ', f"{fn} {sn}".strip())
    return re.sub(r'^[\-\s&,\.]+', '', nm).strip()[:255]

# Generic mailbox local parts. A row that only carries one of these is a shared
# department inbox, not the person's own address, so it must never win over a
# real personal address on the same row.
GENERIC_LOCALS = {
    'info', 'mail', 'email', 'office', 'admin', 'contact', 'general', 'reception',
    'purchasing', 'purchase', 'purch', 'pu', 'procurement', 'buying', 'supply',
    'supplies', 'spares', 'stores', 'technical', 'tech', 'te', 'engineering',
    'accounts', 'accounting', 'account', 'ac', 'finance', 'payables', 'invoice',
    'invoices', 'ap', 'crew', 'crewing', 'marine', 'operations', 'ops', 'chartering',
    'hsqe', 'hsq', 'safety', 'quality', 'vetting', 'sales', 'service', 'support',
    'shipping', 'logistics', 'secretariat', 'management',
}

def transliterate(s):
    """Rough Greek -> Latin mapping so Greek names can be compared to Latin email local parts."""
    table = str.maketrans({
        'Α': 'A', 'Β': 'V', 'Γ': 'G', 'Δ': 'D', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'I', 'Θ': 'T',
        'Ι': 'I', 'Κ': 'K', 'Λ': 'L', 'Μ': 'M', 'Ν': 'N', 'Ξ': 'X', 'Ο': 'O', 'Π': 'P',
        'Ρ': 'R', 'Σ': 'S', 'Τ': 'T', 'Υ': 'Y', 'Φ': 'F', 'Χ': 'C', 'Ψ': 'P', 'Ω': 'O',
        'Ά': 'A', 'Έ': 'E', 'Ή': 'I', 'Ί': 'I', 'Ό': 'O', 'Ύ': 'Y', 'Ώ': 'O', 'Ϊ': 'I', 'Ϋ': 'Y',
    })
    return s.upper().translate(table)

def email_score(addr, person_name):
    """Higher is better. Prefers an address that looks like it belongs to this person."""
    local = addr.split('@', 1)[0].lower()
    bare = re.sub(r'[^a-z]', '', local)
    score = 0
    if local in GENERIC_LOCALS or bare in GENERIC_LOCALS:
        score -= 10
    # Reward overlap with the person's name tokens (handles n.loukos, msaxena, gpapas…)
    tokens = [t for t in re.split(r'[^A-Za-z\u0370-\u03FF]+', transliterate(person_name)) if len(t) >= 3]
    for t in tokens:
        tl = t.lower()
        if tl in bare:
            score += 5
            break
        # initial + surname patterns
        if len(tl) >= 4 and tl[:4] in bare:
            score += 3
            break
    return score

def pick_email(addrs, person_name):
    """Choose the best address for this person, keeping the original order as tie-break."""
    best, best_score = addrs[0], email_score(addrs[0], person_name)
    for a in addrs[1:]:
        s = email_score(a, person_name)
        if s > best_score:
            best, best_score = a, s
    return best

# Role tokens that appear in the name field of shared mailboxes. When Dept. is
# empty we promote the recognised token to the Position column so the row still
# says what the mailbox is for.
ROLE_TOKENS = [
    ("PURCHASING", "Purchasing"), ("PURCH", "Purchasing"), ("PU", "Purchasing"),
    ("SPARES", "Spares"), ("SUPPLY", "Supply"), ("PROCUREMENT", "Purchasing"),
    ("TECHNICAL", "Technical"), ("TECH", "Technical"),
    ("ACCOUNTING", "Accounting"), ("ACCOUNTS", "Accounting"), ("ACCOUNT", "Accounting"),
    ("PAYABLES", "Accounting"), ("FINANCE", "Accounting"),
    ("OPERATIONS", "Operations"), ("OPERATION", "Operations"),
    ("MARINE", "Marine"), ("VETTING", "Marine"), ("CREW", "Crew"),
    ("HSQE", "HSQE"), ("HSQ", "HSQE"), ("SAFETY", "Safety"),
]

def role_from_name(nm):
    up = re.sub(r'[^A-Z ]', ' ', nm.upper())
    words = set(up.split())
    for token, label in ROLE_TOKENS:
        if token in words:
            return label
    return ""

def position(r, nm=""):
    d = "" if pd.isna(r['Dept.']) else str(r['Dept.']).strip()
    c = "" if pd.isna(r['Comments']) else str(r['Comments']).strip()
    if not d:
        d = role_from_name(nm)
    if c and len(c) <= 30 and not re.search(r'\d{4}|@', c):
        if d and c.upper() != d.upper(): return f"{d} — {c}"[:255]
        return (d or c)[:255]
    return d[:255]

def phone(r):
    for k in ['Cell phone', 'Tel. 1', 'Tel. 2']:
        v = r[k]
        if v is None or pd.isna(v): continue
        p = re.sub(r'[^\d\+]', '', str(v).split(',')[0].split(';')[0])
        if len(re.sub(r'\D', '', p)) >= 7:
            return p[:20]
    return None

records, seen = [], {}
stats = dict(rows=0, no_company=0, unmatched=0, flagged=0, inactive=0, no_email=0, no_name=0, dupes=0)
for _, r in df.iterrows():
    stats['rows'] += 1
    cn = r['Name.1']
    if cn is None or pd.isna(cn):
        stats['no_company'] += 1; continue
    m = cmap.get(norm(cn)) or gmap.get(norm(cn))
    if not m:
        stats['unmatched'] += 1; continue
    flag = r['Table 01']
    if flag is not None and not pd.isna(flag) and str(flag).strip() in ('Invalid', 'Unsubscribe'):
        stats['flagged'] += 1; continue
    if r['Active'] == 0:
        stats['inactive'] += 1; continue
    es = emails(r)
    if not es:
        stats['no_email'] += 1; continue
    nm = full_name(r)
    if not nm:
        stats['no_name'] += 1; continue
    cid, cname, grp, tier = m
    pos, ph = position(r, nm), phone(r)
    # Prefer the address that actually belongs to this person; a shared department
    # inbox is only used when the row has nothing better.
    primary = pick_email(es, nm)
    # Dedup on the person, not on the mailbox: many colleagues legitimately share
    # one generic inbox (pu@thenamaris.com etc.) and all of them must be kept.
    # When the ERP holds several rows for one person, keep a single row using the
    # best-scoring address and backfill any missing phone/position.
    key = (cid, re.sub(r'\s+', ' ', nm).strip().upper())
    score = email_score(primary, nm)
    rec = dict(customerId=cid, name=nm, email=primary, phone=ph, title=pos or None,
               company=cname, group=grp, tier=tier,
               erpCode=None if pd.isna(r['Code']) else str(r['Code']).strip())
    prev = seen.get(key)
    if prev is not None:
        stats['dupes'] += 1
        prev_idx, prev_score = prev
        old = records[prev_idx]
        if score > prev_score:
            rec['phone'] = rec['phone'] or old['phone']
            rec['title'] = rec['title'] or old['title']
            records[prev_idx] = rec
            seen[key] = (prev_idx, score)
        else:
            if not old['phone'] and ph:
                old['phone'] = ph
            if not old['title'] and pos:
                old['title'] = pos
        continue
    seen[key] = (len(records), score)
    records.append(rec)

json.dump(records, open("/tmp/contacts_import.json", "w"), ensure_ascii=False)
print("STATS:", json.dumps(stats, indent=None))
print("records to insert:", len(records))
print("distinct customers:", len({r['customerId'] for r in records}))
print("distinct groups:", len({r['group'] for r in records}))
print("with phone:", sum(1 for r in records if r['phone']))
print("with position:", sum(1 for r in records if r['title']))
print("distinct emails:", len({r['email'] for r in records}))
print("rows on a shared mailbox:", len(records) - len({r['email'] for r in records}))
print("\nsample:")
for r in records[:6]: print(" ", r['group'], "|", r['name'], "|", r['title'], "|", r['email'], "|", r['phone'])
