On a sale:
* If there were buys on the same day, fault - we don't handle same day matching.
* If there are buys within 30d forward, match as much as we can. Mark those buys accordingly.
  * Log what was matched
* Whatever is left over, remove from pool?

On a buy:
* Add what's not matched to the pool
* Note what was matched?
