## Context Metrics Summary

_Aggregated from most recent run batch (2 timestamp directories)_

| Mode | Task | Runs | Success Rate | Tokens (median) | Prompt Bytes (median) | Tool Def Bytes (median) | Latency ms (median) | Est. Cost (median) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | cloudflare-search-docs-workers | 3 | 1 | 6419 | 25072 | 24247 | 853 | 0.019581 |
| baseline | supabase-get-project-url | 3 | 1 | 2294 | 10570 | 9772 | 797 | 0.007086 |
| baseline | supabase-list-tables-public | 3 | 1 | 2295 | 10570 | 9772 | 767 | 0.007113 |
| toolbox | cloudflare-search-docs-workers | 3 | 1 | 409 | 1625 | 800 | 645 | 0.001551 |
| toolbox | supabase-get-project-url | 3 | 1 | 234 | 955 | 157 | 591 | 0.000906 |
| toolbox | supabase-list-tables-public | 3 | 1 | 269 | 1125 | 327 | 611 | 0.001035 |

## Delta (Toolbox vs Baseline)

| Task | Tokens (median) | Prompt Bytes (median) | Tool Def Bytes (median) | Latency ms (median) | Est. Cost (median) |
| --- | --- | --- | --- | --- | --- |
| cloudflare-search-docs-workers | -93.63% | -93.52% | -96.7% | -24.38% | -92.08% |
| supabase-get-project-url | -89.8% | -90.96% | -98.39% | -25.85% | -87.21% |
| supabase-list-tables-public | -88.28% | -89.36% | -96.65% | -20.34% | -85.45% |
