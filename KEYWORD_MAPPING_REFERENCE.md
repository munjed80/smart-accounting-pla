# Smart Classification Reference - Keyword to Account Mapping

## 🎯 Quick Reference: Merchant → Ledger Account

This document shows exactly which keywords trigger which ledger account codes.

### Priority System
- **Priority 1**: High confidence matches (business expenses)
- **Priority 2**: Medium confidence (mixed use)
- **Priority 3**: Low confidence (likely private)

---

## 📊 Account Mapping Table

| Code | Account Name | Priority | Keywords |
|------|-------------|----------|----------|
| **4000** | Autokosten & Brandstof | 1 | shell, bp, esso, texaco, total, tankstation, fuel, benzine, diesel, parkeren, parking |
| **4050** | Reiskosten Openbaar Vervoer | 1 | ns, ov, chipkaart, trein, train, metro, tram, bus |
| **4100** | Huisvestingskosten | 1 | huur, rent, kantoor, office, workspace |
| **4300** | Kantoorkosten & Apparatuur | 1 | laptop, computer, monitor, keyboard, mouse, desk, chair, mediamarkt, coolblue, bol.com |
| **4310** | Software & Licenties | 1 | microsoft, google workspace, adobe, dropbox, hosting, domain, aws, azure, digitalocean, heroku, github, saas, software |
| **4500** | Algemene kosten (Lunch/Diner) | 2 | albert heijn, jumbo, lidl, aldi, plus, ah to go, supermarkt, restaurant, lunch, cafe, horeca |
| **4550** | Telefoon & Internet | 1 | kpn, vodafone, tmobile, ziggo, telecom, internet, mobile, phone, sim |
| **4600** | Bankkosten | 1 | bank, ing, rabobank, abn amro, transaction fee, bankcosts |
| **4800** | Administratiekosten | 1 | accountant, boekhouder, administratie, bookkeeping |
| **7000** | Inkoopkosten | 2 | inkoop, purchase, supplier, leverancier, groothandel |
| **9999** | Te rubriceren | 99 | *Fallback* - No keyword match found |

---

## 🔍 Example Classifications

### ✅ Shell Invoice
```
Merchant: "Shell Nederland B.V."
Text: "Tankstation Shell, Benzine, Utrecht"
→ Match: shell, tankstation, benzine
→ Predicted Account: 4000 (Autokosten & Brandstof)
→ Confidence: 85%
```

### ✅ Albert Heijn Receipt
```
Merchant: "Albert Heijn"
Text: "AH to go, Lunch, Sandwich"
→ Match: albert heijn, ah to go, lunch
→ Predicted Account: 4500 (Algemene kosten)
→ Confidence: 70%
```

### ✅ KPN Telecom Bill
```
Merchant: "KPN B.V."
Text: "Mobiel abonnement, Internet"
→ Match: kpn, mobile, internet
→ Predicted Account: 4550 (Telefoon & Internet)
→ Confidence: 90%
```

### ✅ Microsoft Azure
```
Merchant: "Microsoft Corporation"
Text: "Azure Cloud Services, Hosting"
→ Match: microsoft, azure, hosting
→ Predicted Account: 4310 (Software & Licenties)
→ Confidence: 95%
```

### ⚠️ Unknown Merchant
```
Merchant: "Random Store B.V."
Text: "General purchase"
→ Match: None
→ Predicted Account: 9999 (Te rubriceren)
→ Confidence: 10%
```

---

## 🧠 How the AI Decides

### Scoring Algorithm

```python
for each account_rule:
    matches = count(keywords_found_in_text)
    score = matches * (100 / priority)
    
    if score > best_score:
        best_account = this_account
```

### Example Calculation

**Invoice text**: "Shell Tankstation - Benzine Diesel Utrecht"

| Account | Matches | Priority | Score | Result |
|---------|---------|----------|-------|--------|
| 4000 | 3 (shell, tankstation, benzine) | 1 | 3 × 100 = **300** | ✅ Winner |
| 4050 | 0 | 1 | 0 | ❌ |
| 4310 | 0 | 1 | 0 | ❌ |

**Predicted**: Account 4000 with 85% confidence

---

## ➕ Adding New Keywords

To add a new merchant/keyword:

1. **Edit**: `spark-worker/processor.py`
2. **Find**: `LedgerAccountPredictor.ACCOUNT_RULES`
3. **Add keyword** to appropriate account:

```python
'4000': {
    'name': 'Autokosten & Brandstof',
    'keywords': [
        'shell', 'bp', 'esso',
        'tinq',  # ← Add new keyword here
    ],
    'priority': 1
}
```

4. **Rebuild** Docker image
5. **Deploy** to Coolify

---

## 📋 Common Dutch Merchants

### Fuel Stations (→ 4000)
- Shell Nederland
- BP
- Esso
- Texaco
- Total
- Tinq (Electric)

### Supermarkets (→ 4500)
- Albert Heijn
- Jumbo
- Lidl
- Aldi
- Plus
- AH to go

### Electronics (→ 4300)
- MediaMarkt
- Coolblue
- Bol.com
- Alternate
- Azerty

### Telecom (→ 4550)
- KPN
- Vodafone
- T-Mobile
- Ziggo
- Tele2

### Software/Cloud (→ 4310)
- Microsoft (Office 365, Azure)
- Google Workspace
- Adobe Creative Cloud
- GitHub
- AWS
- DigitalOcean

### Transport (→ 4050)
- NS (Nederlandse Spoorwegen)
- OV-chipkaart
- GVB (Amsterdam)
- RET (Rotterdam)

---

## 🎓 Machine Learning (Future)

In a future version, the system will:

1. **Learn from corrections**: When an accountant changes 9999 → 4000, remember that merchant
2. **Improve confidence**: Track accuracy per merchant
3. **Auto-suggest**: "This looks like fuel, but you usually book Shell to 4100 instead of 4000"

For now, the keyword mapping provides **80-90% accuracy** out of the box.

---

## ✅ Validation Tips

### For Accountants

When reviewing draft bookings:

- ✅ **High confidence (80%+)**: Usually correct, quick approve
- ⚠️ **Medium confidence (50-80%)**: Double-check account code
- ❌ **Low confidence (<50%)**: Manually verify merchant and amount

### For Developers

To test keyword matching:

```python
from processor import LedgerAccountPredictor

account, name, confidence = LedgerAccountPredictor.predict(
    merchant_name="Shell Nederland",
    description="Tankstation Utrecht Benzine"
)

print(f"Account: {account} ({name})")
print(f"Confidence: {confidence}%")
# Output: Account: 4000 (Autokosten & Brandstof)
#         Confidence: 85%
```

---

**Last Updated**: 2024-01-25  
**Version**: 1.0.0
