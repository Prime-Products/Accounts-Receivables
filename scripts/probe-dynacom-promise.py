"""Inspect the promise rows that make Log Call claim DYNACOM has an open promise."""
import os
import pymysql
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

c.execute("SHOW COLUMNS FROM promises_to_pay")
cols = [r["Field"] for r in c.fetchall()]
print("COLUMNS:", cols)

c.execute(
    """
    SELECT p.*, cu.name AS cust, cu.customerGroup AS grp
    FROM promises_to_pay p JOIN customers cu ON cu.id = p.customerId
    WHERE cu.customerGroup LIKE %s OR cu.name LIKE %s
    ORDER BY p.id DESC
    """,
    ("%DYNACOM%", "%DYNACOM%"),
)
rows = c.fetchall()
print(f"\n{len(rows)} promise rows for DYNACOM:")
for r in rows:
    print({k: r.get(k) for k in ("id", "customerId", "cust", "grp", "amount", "promisedDate", "status", "rescheduleCount", "notes")})

c.execute("SELECT status, COUNT(*) n, SUM(amount = 0) zero FROM promises_to_pay GROUP BY status")
print("\nAll promises by status:", c.fetchall())

c.execute("SELECT COUNT(*) n FROM promises_to_pay WHERE status = 'Pending' AND amount = 0")
print("Pending promises with zero amount:", c.fetchone())
