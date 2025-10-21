(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-INVALID-CAMPAIGN u301)
(define-constant ERR-INVALID-PUBLISHER u302)
(define-constant ERR-INVALID-USER u303)
(define-constant ERR-CAMPAIGN-INACTIVE u304)
(define-constant ERR-IMPRESSION-COOLDOWN u305)
(define-constant ERR-INVALID-TIMESTAMP u306)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u307)
(define-constant ERR-INVALID-IMPRESSION-LIMIT u308)
(define-constant ERR-IMPRESSION-LIMIT-EXCEEDED u309)
(define-constant ERR-INVALID-DEVICE-ID u310)
(define-constant ERR-INVALID-LOCATION u311)
(define-constant ERR-INVALID-REFERRER u312)
(define-constant ERR-INVALID-CATEGORY u313)
(define-constant ERR-INVALID-DURATION u314)
(define-constant ERR-INVALID-STATUS u315)
(define-constant ERR-INVALID-UPDATE-PARAM u316)
(define-constant ERR-MAX_IMPRESSIONS_EXCEEDED u317)
(define-constant ERR-INVALID-COOLDOWN u318)
(define-constant ERR-INVALID_THRESHOLD u319)
(define-constant ERR-INVALID_FEE u320)

(define-data-var next-impression-id uint u0)
(define-data-var max-impressions-per-campaign uint u1000000)
(define-data-var impression-cooldown uint u10)
(define-data-var authority-contract (optional principal) none)
(define-data-var verification-fee uint u100)
(define-data-var daily-limit-per-user uint u100)
(define-data-var global-impression-count uint u0)

(define-map impressions
  { campaign-id: uint, publisher: principal, user: principal }
  {
    count: uint,
    last-impression: uint,
    device-id: (string-ascii 64),
    location: (string-ascii 100),
    referrer: (optional principal),
    category: (string-ascii 50),
    duration: uint,
    status: bool
  }
)

(define-map impressions-by-campaign uint uint)
(define-map impressions-by-user principal uint)
(define-map impressions-by-publisher principal uint)
(define-map impression-updates
  uint
  {
    update-timestamp: uint,
    updater: principal,
    new-status: bool
  }
)

(define-read-only (get-impression 
  (campaign-id uint) 
  (publisher principal) 
  (user principal))
  (map-get? impressions 
    { campaign-id: campaign-id, 
      publisher: publisher, 
      user: user })
)

(define-read-only (get-impressions-by-campaign (campaign-id uint))
  (default-to u0 
    (map-get? impressions-by-campaign campaign-id))
)

(define-read-only (get-impressions-by-user (user principal))
  (default-to u0 
    (map-get? impressions-by-user user))
)

(define-read-only (get-impressions-by-publisher (publisher principal))
  (default-to u0 
    (map-get? impressions-by-publisher publisher))
)

(define-read-only (get-impression-updates (impression-id uint))
  (map-get? impression-updates impression-id)
)

(define-private (validate-campaign (campaign-id uint))
  (match (get-campaign-details campaign-id)
    details 
      (if (get active details)
        (ok true)
        (err ERR-CAMPAIGN-INACTIVE))
    (err ERR-INVALID-CAMPAIGN))
)

(define-private (validate-publisher (publisher principal))
  (if (is-eq 
       (unwrap! (get-user-role publisher) (err ERR-INVALID-PUBLISHER)) 
       "publisher")
    (ok true)
    (err ERR-INVALID-PUBLISHER))
)

(define-private (validate-user (user principal))
  (if (is-eq 
       (unwrap! (get-user-role user) (err ERR-INVALID-USER)) 
       "user")
    (ok true)
    (err ERR-INVALID-USER))
)

(define-private (validate-cooldown 
  (last uint) 
  (current uint) 
  (cooldown uint))
  (if (>= current (+ last cooldown))
    (ok true)
    (err ERR-IMPRESSION-COOLDOWN))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-device-id (id (string-ascii 64)))
  (if (and (> (len id) u0) (<= (len id) u64))
    (ok true)
    (err ERR-INVALID-DEVICE-ID))
)

(define-private (validate-location (loc (string-ascii 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
    (ok true)
    (err ERR-INVALID-LOCATION))
)

(define-private (validate-referrer (ref (optional principal)))
  (ok true)
)

(define-private (validate-category (cat (string-ascii 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50))
    (ok true)
    (err ERR-INVALID-CATEGORY))
)

(define-private (validate-duration (dur uint))
  (if (> dur u0)
    (ok true)
    (err ERR-INVALID-DURATION))
)

(define-private (validate-status (stat bool))
  (ok true)
)

(define-private (validate-impression-limit 
  (current uint) 
  (limit uint))
  (if (< current limit)
    (ok true)
    (err ERR-IMPRESSION-LIMIT-EXCEEDED))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) 
      (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-impressions-per-campaign (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-INVALID-IMPRESSION-LIMIT))
    (asserts! (is-some (var-get authority-contract)) 
      (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-impressions-per-campaign new-max)
    (ok true)
  )
)

(define-public (set-impression-cooldown (new-cooldown uint))
  (begin
    (asserts! (> new-cooldown u0) (err ERR-INVALID_COOLDOWN))
    (asserts! (is-some (var-get authority-contract)) 
      (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set impression-cooldown new-cooldown)
    (ok true)
  )
)

(define-public (set-verification-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID_FEE))
    (asserts! (is-some (var-get authority-contract)) 
      (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set verification-fee new-fee)
    (ok true)
  )
)

(define-public (set-daily-limit-per-user (new-limit uint))
  (begin
    (asserts! (> new-limit u0) (err ERR_INVALID_IMPRESSION-LIMIT))
    (asserts! (is-some (var-get authority-contract)) 
      (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set daily-limit-per-user new-limit)
    (ok true)
  )
)

(define-public (record-impression
  (campaign-id uint)
  (publisher principal)
  (device-id (string-ascii 64))
  (location (string-ascii 100))
  (referrer (optional principal))
  (category (string-ascii 50))
  (duration uint)
)
  (let (
    (user tx-sender)
    (next-id (var-get next-impression-id))
    (authority (var-get authority-contract))
    (cooldown (var-get impression-cooldown))
    (daily-limit (var-get daily-limit-per-user))
    (max-per-campaign (var-get max-impressions-per-campaign))
    (current-campaign-count 
      (get-impressions-by-campaign campaign-id))
    (current-user-count 
      (get-impressions-by-user user))
    (current-publisher-count 
      (get-impressions-by-publisher publisher))
    (key { campaign-id: campaign-id, 
           publisher: publisher, 
           user: user })
    (current (default-to 
               { count: u0, 
                 last-impression: u0, 
                 device-id: "", 
                 location: "", 
                 referrer: none, 
                 category: "", 
                 duration: u0, 
                 status: true } 
               (map-get? impressions key)))
  )
    (try! (validate-campaign campaign-id))
    (try! (validate-publisher publisher))
    (try! (validate-user user))
    (try! (validate-device-id device-id))
    (try! (validate-location location))
    (try! (validate-referrer referrer))
    (try! (validate-category category))
    (try! (validate-duration duration))
    (try! (validate-cooldown 
           (get last-impression current) 
           block-height 
           cooldown))
    (try! (validate-impression-limit 
           current-user-count 
           daily-limit))
    (try! (validate-impression-limit 
           current-campaign-count 
           max-per-campaign))
    (asserts! (is-some authority) 
      (err ERR-AUTHORITY-NOT-VERIFIED))
    (try! (stx-transfer? 
           (var-get verification-fee) 
           tx-sender 
           (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
    (map-set impressions key
      {
        count: (+ (get count current) u1),
        last-impression: block-height,
        device-id: device-id,
        location: location,
        referrer: referrer,
        category: category,
        duration: duration,
        status: true
      }
    )
    (map-set impressions-by-campaign 
      campaign-id 
      (+ current-campaign-count u1))
    (map-set impressions-by-user 
      user 
      (+ current-user-count u1))
    (map-set impressions-by-publisher 
      publisher 
      (+ current-publisher-count u1))
    (var-set next-impression-id (+ next-id u1))
    (var-set global-impression-count 
      (+ (var-get global-impression-count) u1))
    (print { event: "impression-recorded", 
             id: next-id, 
             campaign: campaign-id, 
             user: user })
    (ok next-id)
  )
)

(define-public (update-impression-status
  (campaign-id uint)
  (publisher principal)
  (user principal)
  (new-status bool)
  (impression-id uint)
)
  (let (
    (key { campaign-id: campaign-id, 
           publisher: publisher, 
           user: user })
    (impression (map-get? impressions key))
  )
    (match impression
      imp
        (begin
          (asserts! (is-eq tx-sender 
                    (unwrap! (get-user-role tx-sender) 
                      (err ERR-NOT-AUTHORIZED))) 
            (err ERR-NOT-AUTHORIZED))
          (try! (validate-status new-status))
          (map-set impressions key
            (merge imp { status: new-status }))
          (map-set impression-updates impression-id
            {
              update-timestamp: block-height,
              updater: tx-sender,
              new-status: new-status
            }
          )
          (print { event: "impression-updated", 
                   id: impression-id, 
                   status: new-status })
          (ok true)
        )
      (err ERR-INVALID_UPDATE-PARAM)
    )
  )
)

(define-public (get-global-impression-count)
  (ok (var-get global-impression-count))
)

(define-public (get-next-impression-id)
  (ok (var-get next-impression-id))
)