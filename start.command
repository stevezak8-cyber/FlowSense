#!/bin/bash
# FlowSense — one-click setup & launch

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FlowSense Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$SCRIPT_DIR/backend"

# ── Baseline existing DB if needed (P3005) ──
echo "▶ Baselining existing database schema..."
npx prisma migrate resolve --applied 20250101000000_init 2>/dev/null || true
npx prisma migrate resolve --applied 20250101000001_technician_on_duty 2>/dev/null || true
npx prisma migrate resolve --applied 20250508000000_add_org_contact_fields 2>/dev/null || true

# ── Apply migrations ────────────────────────
echo "▶ Running database migrations..."
npm run db:migrate:deploy
if [ $? -ne 0 ]; then
  echo ""
  echo "⚠️  Migration failed. Make sure PostgreSQL is running."
  read -p "Press Enter to close..."
  exit 1
fi

echo ""
echo "▶ Seeding demo data..."
npm run db:seed

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting servers..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Backend ─────────────────────────────────
osascript -e "tell application \"Terminal\"
  activate
  do script \"echo '── FlowSense Backend ──' && cd '$SCRIPT_DIR/backend' && npm run dev\"
end tell"

# ── Frontend ────────────────────────────────
osascript -e "tell application \"Terminal\"
  activate
  do script \"echo '── FlowSense Frontend ──' && cd '$SCRIPT_DIR/frontend' && npm run dev\"
end tell"

echo "✅ Servers are starting..."
echo ""
echo "  Backend:   http://localhost:4000"
echo "  Frontend:  http://localhost:5173"
echo ""

sleep 4
open "http://localhost:5173"
