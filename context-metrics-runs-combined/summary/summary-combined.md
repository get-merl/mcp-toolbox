## Combined Test Summary (Scaling + Result Filtering)

_Aggregated from most recent run batch (2 timestamp directories)_

| Mode | Runs | Success | Tool Count | Tool Def Bytes | Total Tokens | Raw Result Bytes | Filtered Result Bytes | Result in Context | Est. Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| toolbox | 12 | 1 | 1 | 327 | 772.5 | 268 | 281 | 323 | 0.0033794999999999997 |
| baseline-30 | 6 | 1 | 30 | 13021 | 8532 | 287 | 287 | 325 | 0.03132 |
| baseline-50 | 6 | 1 | 50 | 18213 | 10881 | 287 | 287 | 325 | 0.037659 |
| baseline-100 | 6 | 1 | 100 | 33691 | 17824.5 | 282 | 282 | 320 | 0.0586035 |
| baseline-200 | 6 | 1 | 200 | 66478 | 32479.5 | 287.5 | 287.5 | 325.5 | 0.10265250000000001 |
| baseline-500 | 6 | 1 | 500 | 159978 | 74581.5 | 282 | 282 | 320 | 0.22864649999999997 |

## Comparison: Baseline vs Toolbox

| Tool Count | Tool Def Bytes Saved | Result Bytes Saved | Total Tokens Saved | Cost Saved |
| --- | --- | --- | --- | --- |
| 30 | -97.49% | -0.62% | -90.95% | -89.21% |
| 50 | -98.2% | -0.62% | -92.9% | -91.03% |
| 100 | -99.03% | +0.94% | -95.67% | -94.23% |
| 200 | -99.51% | -0.77% | -97.62% | -96.71% |
| 500 | -99.8% | +0.94% | -98.96% | -98.52% |
