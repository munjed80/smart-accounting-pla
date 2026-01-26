# Dutch VAT/BTW Box Mapping Compliance Notes

## Overview

This document explains the corrected VAT box mappings implemented to comply with Dutch Belastingdienst rules for the BTW Aangifte (VAT return).

## Box Mapping Corrections

### Issue: Incorrect Box Assignments for EU Acquisitions and Reverse Charge

The original implementation had incorrect mappings for:
- `INTRA_EU_GOODS` was incorrectly mapped to box **2a** instead of **4b**
- `RC_EU_SERVICES` was ambiguously named and mapped
- `RC_IMPORT` was incorrectly mapped to box **4b** instead of **4a**

### Corrected Box Semantics

| Box | Description (Dutch) | Description (English) | Use Case |
|-----|---------------------|----------------------|----------|
| 1a | Leveringen/diensten hoog tarief (21%) | Supplies at high rate | NL domestic sales at 21% |
| 1b | Leveringen/diensten laag tarief (9%) | Supplies at low rate | NL domestic sales at 9% |
| 1e | Leveringen belast met 0% | Zero-rate supplies | Exempt/zero-rate domestic |
| 2a | Binnenlandse verlegging | Domestic reverse charge | Specific NL transactions (art. 24ba) |
| 3b | Leveringen naar EU (ICP) | Intra-Community supplies | Sales TO other EU countries |
| **4a** | Diensten/invoer buiten EU | Non-EU services + imports | Services FROM non-EU + import VAT |
| **4b** | Verwervingen uit EU | Intra-EU acquisitions | Goods/services FROM other EU countries |
| 5a | Verschuldigde btw | VAT payable subtotal | Sum of 1a-1d, 2a, 4a, 4b |
| 5b | Voorbelasting | Input VAT (deductible) | All deductible VAT |
| 5c | Subtotaal | Subtotal | 5a - 5b |
| 5g | Te betalen/ontvangen | Total to pay/receive | Final amount |

## VAT Code Mappings

### INTRA_EU_GOODS (Corrected)
- **Before:** `turnover_box: 2a, vat_box: 2a, deductible_box: 5b`
- **After:** `turnover_box: 4b, vat_box: 4b, deductible_box: 5b`
- **Reason:** Intra-EU acquisitions where the NL buyer self-assesses VAT go to box 4b per current Belastingdienst guidelines.

### RC_EU_SERVICES → RC_NON_EU_SERVICES (Renamed)
- **Before:** `code: RC_EU_SERVICES` (confusing name)
- **After:** `code: RC_NON_EU_SERVICES` (clear: non-EU services)
- **Mapping:** `turnover_box: 4a, vat_box: 4a, deductible_box: 5b`
- **Reason:** Services from non-EU countries where VAT is shifted to NL buyer go to box 4a.

### EU_ACQUISITION_SERVICES (New)
- **Mapping:** `turnover_box: 4b, vat_box: 4b, deductible_box: 5b`
- **Reason:** New code added for services acquired from EU countries → box 4b.

### RC_IMPORT (Corrected)
- **Before:** `turnover_box: 4b, vat_box: 4b, deductible_box: 5b`
- **After:** `turnover_box: 4a, vat_box: 4a, deductible_box: 5b`
- **Reason:** Import VAT cases go to box 4a, not 4b.

### ICP_SUPPLIES (Unchanged)
- **Mapping:** `turnover_box: 3b` (no VAT - 0% rate)
- **Reason:** Supplies to EU countries (ICP) correctly map to box 3b.

## Reverse Charge / EU Acquisition Net Effect

For reverse charge and EU acquisition transactions, the VAT appears in two places:
1. **VAT payable** (box 4a or 4b) - counted in box 5a subtotal
2. **VAT deductible** (box 5b) - voorbelasting

This results in a **net zero effect** when the VAT is fully deductible, which is the correct treatment per Belastingdienst rules.

Example:
```
EU acquisition of goods: €1,000 base, 21% VAT = €210
- Box 4b turnover: €1,000
- Box 4b VAT: €210 (contributes to 5a)
- Box 5b: €210 (deductible)
- Net effect (5a - 5b): €0
```

## Migration Strategy

A new migration (`007_fix_dutch_vat_box_mapping.py`) was created to:
1. Update existing VAT codes with correct box mappings
2. Rename `RC_EU_SERVICES` to `RC_NON_EU_SERVICES` for clarity
3. Add new `EU_ACQUISITION_SERVICES` code
4. Preserve existing data through UPDATE statements (not DELETE/INSERT)

The original migration (`006_dutch_vat_btw_engine.py`) was not modified to preserve migration history.

## References

- Belastingdienst BTW-aangifte: https://www.belastingdienst.nl/wps/wcm/connect/nl/btw/
- Article 12 Wet OB (reverse charge services)
- Article 24ba Wet OB (domestic reverse charge)
- ICP (Intracommunautaire prestaties) reporting requirements
