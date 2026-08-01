"""Inspect the Pending promises and their follow-up tasks (Log Call open-promise bug)."""
import os
import pymysql
from datetime import datetime, timezone
from urllib.parse import urlparse

u = urlparse(os.environ["DATABASE_URL"])
cn = pymysql.connect(
    host=u.hostname,
    port=u.port or 3306,
    user=u.username,
    password=u.password,
    database=u.path.lstrip("/"),
    ssl={"ssl": {}},
    cursorclass=pymysql.cursors.DictCursor,
)
c = cn.cursor()


def fmt(v):
    """Epoch-ms integers and native datetimes both appear in this schema."""
    if v is None:
        return "—"
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M")
    return datetime.fromtimestamp(v / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


c.execute(
    """
    SELECT p.*, cu.name AS cust, cu.customerGroup AS grp
    FROM promises_to_pay p JOIN customers cu ON cu.id = p.customerId
    WHERE p.status = 'Pending' ORDER BY p.id DESC
    """
)
print("PENDING PROMISES:")
for r in c.fetchall():
    print(f"  id={r['id']} cust={r['cust']!r} grp={r['grp']!r} amount={r['amount']} due={fmt(r['promisedDate'])} created={fmt(r.get('createdAt'))} notes={r.get('notes')!r}")

c.execute("SELECT id, type, title, description, status, dueDate FROM tasks WHERE status IN ('Pending','In Progress') AND customerId IN (143, 144) ORDER BY id DESC LIMIT 15")
print("\nOPEN TASKS on DYNACOM customers:")
for t in c.fetchall():
    print(f"  id={t['id']} type={t['type']} {t['title']!r} status={t['status']} due={fmt(t['dueDate'])} desc={str(t['description'])[:80]!r}")

c.execute("SHOW TABLES LIKE '%onfirmation%'")
print("\nconfirmation tables:", c.fetchall())
