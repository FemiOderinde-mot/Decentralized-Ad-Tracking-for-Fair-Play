(define-constant ERR-INVALID-CAMPAIGN-ID u500)
(define-constant ERR-NOT-ADVERTISER u501)
(define-constant ERR-INSUFFICIENT-FUNDS u502)
(define-constant ERR-ESCROW-NOT-FOUND u503)
(define-constant ERR-INSUFFICIENT-ESCROW u504)
(define-constant ERR-CAMPAIGN-NOT-ACTIVE u505)
(define-constant ERR-INVALID-PUBLISHER u506)
(define-constant ERR-RELEASE-FAILED u507)
(define-constant ERR-INVALID-REFUND-AMOUNT u508)
(define-constant ERR-NOT-PUBLISHER u509)
(define-constant ERR-PAUSED u510)
(define-constant ERR-INVALID-RATE u511)
(define-constant ERR-NOT-OWNER u512)
(define-constant ERR-INVALID-MIN-BUDGET u513)
(define-constant ERR-INVALID-TIMEOUT u514)
(define-constant ERR-DISPUTE-ACTIVE u515)
(define-constant ERR-INVALID-DISPUTE-ID u516)
(define-constant ERR-VOTE-NOT-ALLOWED u517)
(define-constant ERR-INSUFFICIENT-VOTES u518)
(define-constant ERR-RESOLUTION-FAILED u519)

(define-data-var owner principal tx-sender)
(define-data-var impression-value uint u1)
(define-data-var click-value uint u5)
(define-data-var min-budget uint u1000)
(define-data-var escrow-timeout uint u100)
(define-data-var paused bool false)
(define-data-var total-escrows uint u0)

(define-map escrows
  uint
  {
    campaign-id: uint,
    amount: uint,
    released: uint,
    advertiser: principal,
    created-at: uint,
    active: bool,
    dispute-id: (optional uint)
  }
)

(define-map disputes
  uint
  {
    campaign-id: uint,
    disputant: principal,
    votes-yes: uint,
    votes-no: uint,
    resolved: bool,
    resolution: bool
  }
)

(define-map publishers
  { campaign-id: uint, publisher: principal }
  {
    impressions: uint,
    clicks: uint,
    last-claim: uint
  }
)

(define-map refunds
  uint
  {
    campaign-id: uint,
    amount: uint,
    refunded-to: principal,
    timestamp: uint
  }
)

(define-read-only (get-escrow (campaign-id uint))
  (map-get? escrows campaign-id)
)

(define-read-only (get-dispute (dispute-id uint))
  (map-get? disputes dispute-id)
)

(define-read-only (get-publisher-metrics (campaign-id uint) (publisher principal))
  (map-get? publishers { campaign-id: campaign-id, publisher: publisher })
)

(define-read-only (get-refund (campaign-id uint))
  (map-get? refunds campaign-id)
)

(define-read-only (is-paused)
  (var-get paused)
)

(define-read-only (get-impression-value)
  (var-get impression-value)
)

(define-read-only (get-click-value)
  (var-get click-value)
)

(define-read-only (get-min-budget)
  (var-get min-budget)
)

(define-read-only (get-escrow-timeout)
  (var-get escrow-timeout)
)

(define-read-only (get-total-escrows)
  (var-get total-escrows)
)

(define-private (validate-campaign-id (id uint))
  (if (> id u0) (ok true) (err ERR-INVALID-CAMPAIGN-ID))
)

(define-private (validate-advertiser (advertiser principal) (expected principal))
  (if (is-eq advertiser expected) (ok true) (err ERR-NOT-ADVERTISER))
)

(define-private (validate-funds (amount uint))
  (if (> amount (var-get min-budget)) (ok true) (err ERR-INVALID-MIN-BUDGET))
)

(define-private (validate-publisher (publisher principal))
  (if (is-principal publisher) (ok true) (err ERR-INVALID-PUBLISHER))
)

(define-private (validate-escrow-balance (escrow { amount: uint, released: uint }) (payout uint))
  (if (<= payout (- (get amount escrow) (get released escrow))) (ok true) (err ERR-INSUFFICIENT-ESCROW))
)

(define-private (validate-campaign-active (campaign-id uint))
  (if (contract-call? AdCampaign get-campaign-details campaign-id) (ok true) (err ERR-CAMPAIGN-NOT-ACTIVE))
)

(define-private (validate-not-paused)
  (if (not (var-get paused)) (ok true) (err ERR-PAUSED))
)

(define-private (validate-rate (rate uint))
  (if (<= rate u100) (ok true) (err ERR-INVALID-RATE))
)

(define-private (validate-owner (caller principal))
  (if (is-eq caller (var-get owner)) (ok true) (err ERR-NOT-OWNER))
)

(define-private (validate-refund-amount (amount uint) (escrow { amount: uint, released: uint }))
  (if (and (> amount u0) (<= amount (- (get amount escrow) (get released escrow)))) (ok true) (err ERR-INVALID-REFUND-AMOUNT))
)

(define-private (validate-dispute-id (id uint))
  (if (> id u0) (ok true) (err ERR-INVALID-DISPUTE-ID))
)

(define-private (validate-voter (caller principal) (dispute { disputant: principal }))
  (if (not (is-eq caller (get disputant dispute))) (ok true) (err ERR-VOTE-NOT-ALLOWED))
)

(define-private (has-sufficient-votes (votes-yes uint) (votes-no uint) (threshold uint))
  (if (> votes-yes threshold) (ok true) (err ERR-INSUFFICIENT-VOTES))
)

(define-public (set-owner (new-owner principal))
  (begin
    (try! (validate-owner tx-sender))
    (var-set owner new-owner)
    (ok true)
  )
)

(define-public (set-impression-value (new-value uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-rate new-value))
    (var-set impression-value new-value)
    (ok true)
  )
)

(define-public (set-click-value (new-value uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-rate new-value))
    (var-set click-value new-value)
    (ok true)
  )
)

(define-public (set-min-budget (new-min uint))
  (begin
    (try! (validate-owner tx-sender))
    (if (> new-min u0) (ok true) (err ERR-INVALID-MIN-BUDGET))
    (var-set min-budget new-min)
    (ok true)
  )
)

(define-public (set-escrow-timeout (new-timeout uint))
  (begin
    (try! (validate-owner tx-sender))
    (if (> new-timeout u0) (ok true) (err ERR-INVALID-TIMEOUT))
    (var-set escrow-timeout new-timeout)
    (ok true)
  )
)

(define-public (pause-escrow (pause bool))
  (begin
    (try! (validate-owner tx-sender))
    (var-set paused pause)
    (ok true)
  )
)

(define-public (fund-escrow (campaign-id uint) (amount uint))
  (let (
    (caller tx-sender)
    (campaign-details (unwrap! (contract-call? AdCampaign get-campaign-details campaign-id) (err ERR-INVALID-CAMPAIGN-ID)))
  )
    (try! (validate-not-paused))
    (try! (validate-campaign-id campaign-id))
    (try! (validate-funds amount))
    (try! (validate-campaign-active campaign-id))
    (try! (validate-advertiser caller (get advertiser campaign-details)))
    (try! (stx-transfer? amount caller (as-contract tx-sender)))
    (map-set escrows campaign-id
      {
        campaign-id: campaign-id,
        amount: amount,
        released: u0,
        advertiser: caller,
        created-at: block-height,
        active: true,
        dispute-id: none
      }
    )
    (var-set total-escrows (+ (var-get total-escrows) u1))
    (print { event: "escrow-funded", campaign-id: campaign-id, amount: amount })
    (ok true)
  )
)

(define-public (release-payment (campaign-id uint) (publisher principal))
  (let* (
    (escrow (unwrap! (map-get? escrows campaign-id) (err ERR-ESCROW-NOT-FOUND)))
    (campaign-details (unwrap! (contract-call? AdCampaign get-campaign-details campaign-id) (err ERR-INVALID-CAMPAIGN-ID)))
    (impressions (default-to u0 (get count (unwrap! (contract-call? ImpressionTracker get-impressions campaign-id publisher) { count: u0, last-impression: u0 }))))
    (clicks (default-to u0 (get count (unwrap! (contract-call? ClickTracker get-clicks campaign-id publisher) { count: u0, last-click: u0 }))))
    (payout (+ (* impressions (var-get impression-value)) (* clicks (var-get click-value))))
    (current-metrics (default-to { impressions: u0, clicks: u0, last-claim: u0 } (map-get? publishers { campaign-id: campaign-id, publisher: publisher })))
    (dispute-id (get dispute-id escrow))
  )
    (try! (validate-not-paused))
    (try! (validate-campaign-active campaign-id))
    (asserts! (not (is-some dispute-id)) (err ERR-DISPUTE-ACTIVE))
    (try! (validate-publisher publisher))
    (try! (validate-escrow-balance escrow payout))
    (try! (as-contract (stx-transfer? payout tx-sender publisher)))
    (map-set escrows campaign-id
      (merge escrow { released: (+ (get released escrow) payout) })
    )
    (map-set publishers { campaign-id: campaign-id, publisher: publisher }
      {
        impressions: impressions,
        clicks: clicks,
        last-claim: block-height
      }
    )
    (print { event: "payment-released", campaign-id: campaign-id, publisher: publisher, payout: payout })
    (ok payout)
  )
)

(define-public (refund-escrow (campaign-id uint) (refund-amount uint))
  (let (
    (escrow (unwrap! (map-get? escrows campaign-id) (err ERR-ESCROW-NOT-FOUND)))
    (advertiser (get advertiser escrow))
  )
    (try! (validate-not-paused))
    (try! (validate-advertiser tx-sender advertiser))
    (try! (validate-refund-amount refund-amount escrow))
    (try! (as-contract (stx-transfer? refund-amount tx-sender advertiser)))
    (map-set escrows campaign-id
      (merge escrow { amount: (- (get amount escrow) refund-amount) })
    )
    (map-set refunds campaign-id
      {
        campaign-id: campaign-id,
        amount: refund-amount,
        refunded-to: advertiser,
        timestamp: block-height
      }
    )
    (print { event: "escrow-refunded", campaign-id: campaign-id, amount: refund-amount })
    (ok true)
  )
)

(define-public (file-dispute (campaign-id uint))
  (let (
    (escrow (unwrap! (map-get? escrows campaign-id) (err ERR-ESCROW-NOT-FOUND)))
    (next-dispute-id (+ (var-get total-escrows) u1))
  )
    (try! (validate-not-paused))
    (map-set escrows campaign-id
      (merge escrow { dispute-id: (some next-dispute-id), active: false })
    )
    (map-set disputes next-dispute-id
      {
        campaign-id: campaign-id,
        disputant: tx-sender,
        votes-yes: u0,
        votes-no: u0,
        resolved: false,
        resolution: false
      }
    )
    (print { event: "dispute-filed", dispute-id: next-dispute-id, campaign-id: campaign-id })
    (ok next-dispute-id)
  )
)

(define-public (vote-on-dispute (dispute-id uint) (vote-yes bool))
  (let (
    (dispute (unwrap! (map-get? disputes dispute-id) (err ERR-INVALID-DISPUTE-ID)))
  )
    (try! (validate-not-paused))
    (asserts! (not (get resolved dispute)) (err ERR-RESOLUTION-FAILED))
    (if vote-yes
      (map-set disputes dispute-id
        (merge dispute { votes-yes: (+ (get votes-yes dispute) u1) })
      )
      (map-set disputes dispute-id
        (merge dispute { votes-no: (+ (get votes-no dispute) u1) })
      )
    )
    (ok true)
  )
)

(define-public (resolve-dispute (dispute-id uint))
  (let* (
    (dispute (unwrap! (map-get? disputes dispute-id) (err ERR-INVALID-DISPUTE-ID)))
    (escrow (unwrap! (map-get? escrows (get campaign-id dispute)) (err ERR-ESCROW-NOT-FOUND)))
    (votes-yes (get votes-yes dispute))
    (votes-no (get votes-no dispute))
    (threshold u3)
    (resolution (if (> votes-yes (+ votes-no threshold)) true false))
  )
    (try! (validate-not-paused))
    (asserts! (is-eq tx-sender (get disputant dispute)) (err ERR-NOT-PUBLISHER))
    (try! (has-sufficient-votes votes-yes votes-no threshold))
    (map-set disputes dispute-id
      (merge dispute { resolved: true, resolution: resolution })
    )
    (map-set escrows (get campaign-id dispute)
      (merge escrow { dispute-id: none, active: true })
    )
    (if resolution
      (print { event: "dispute-resolved-yes", dispute-id: dispute-id })
      (print { event: "dispute-resolved-no", dispute-id: dispute-id })
    )
    (ok resolution)
  )
)