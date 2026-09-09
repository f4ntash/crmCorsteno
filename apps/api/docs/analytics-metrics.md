# Analytics metric definitions

For roulette, `experience_spins` is the authoritative ledger for successful
spins, prize wins (`outcome_type = 'prize'`) and no-prize outcomes. Claims are
read from `roulette_prize_claims`; generated means all claims and redeemed
means `status = 'redeemed'`. Experience views, blocked attempts and animation
events remain UX events in `events`. Spin conversion is successful authoritative
spins divided by experience views, and is zero when there are no views.

All operational queries are scoped to the authenticated organization and the
same date/project/application scope used by the existing Analytics endpoints.
