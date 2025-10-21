# FairAdTrack: Decentralized Ad Tracking for Fair Play

## Overview

FairAdTrack is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world problems in digital advertising, such as ad fraud (e.g., fake clicks and impressions), lack of transparency, and unfair revenue distribution. By leveraging blockchain, it ensures immutable tracking of ad interactions, fair payment settlements, and dispute resolution without intermediaries.

### Key Problems Solved
- **Ad Fraud Prevention**: All impressions, clicks, and engagements are recorded on-chain, making it tamper-proof and verifiable.
- **Transparency**: Advertisers can audit campaigns in real-time; publishers get fair compensation based on verified metrics.
- **User Privacy and Incentives**: Users (viewers) can opt-in for rewards while maintaining control over their data.
- **Efficient Settlements**: Automated payments via escrow reduce disputes and delays.
- **Scalability on Bitcoin**: Built on Stacks, it benefits from Bitcoin's security while enabling smart contracts.

The project involves 6 core smart contracts:
1. **UserRegistry.clar**: Manages registration and roles for advertisers, publishers, and users.
2. **AdCampaign.clar**: Handles creation and management of ad campaigns.
3. **ImpressionTracker.clar**: Records and verifies ad impressions.
4. **ClickTracker.clar**: Records and verifies ad clicks.
5. **PaymentEscrow.clar**: Manages escrowed funds and payouts.
6. **DisputeResolution.clar**: Allows arbitration for disputes using on-chain voting or oracles.

This setup ensures modularity, security, and ease of extension.

## Tech Stack
- **Blockchain**: Stacks (Layer-1 for Bitcoin).
- **Smart Contract Language**: Clarity (secure, decidable, and non-Turing complete).
- **Deployment**: Use Stacks CLI for deployment to Stacks testnet/mainnet.
- **Frontend Integration**: Can be integrated with a dApp using Leather wallet or Hiro Wallet for STX transactions.
- **Token**: Uses STX (Stacks' native token) for payments; optional integration with SIP-10 fungible tokens for rewards.

## Installation and Setup
1. Install Stacks CLI: `npm install -g @stacks/cli`.
2. Clone the repo: <this-repo>.
3. Navigate to the project: `cd FairAdTrack/contracts`.
4. Deploy contracts: Use `clarinet deploy` for local testing or Stacks CLI for testnet.
5. Test: Run unit tests with `clarinet test`.

## Smart Contracts

Below are the Clarity code for each contract. Deploy them in order: UserRegistry first, then others (as they may depend on it).

### 1. UserRegistry.clar
This contract registers users and assigns roles (advertiser, publisher, user). It uses maps for efficient lookups.

```clarity
(define-contract UserRegistry)

(define-map users principal { role: (string-ascii 20) })
(define-map roles (string-ascii 20) (list 100 principal))

(define-public (register-user (user principal) (role (string-ascii 20)))
  (begin
    (asserts! (is-none (map-get? users user)) (err u100)) ;; User not already registered
    (map-set users user { role: role })
    (map-insert roles role (cons user (default-to (list) (map-get? roles role))))
    (ok true)
  )
)

(define-read-only (get-user-role (user principal))
  (match (map-get? users user)
    some-user (ok (get role some-user))
    none (err u101)
  )
)

(define-read-only (get-users-by-role (role (string-ascii 20)))
  (ok (default-to (list) (map-get? roles role)))
)
```

### 2. AdCampaign.clar
Manages ad campaigns: creation, funding, and status. References UserRegistry for advertiser validation.

```clarity
(define-contract AdCampaign
  (import UserRegistry)
)

(define-map campaigns uint {
  advertiser: principal,
  budget: uint,
  start-time: uint,
  end-time: uint,
  active: bool
})
(define-data-var campaign-counter uint u0)

(define-public (create-campaign (budget uint) (duration uint))
  (let ((caller tx-sender) (campaign-id (var-get campaign-counter)))
    (asserts! (is-eq (unwrap! (get-user-role caller) (err u200)) "advertiser") (err u201))
    (map-set campaigns campaign-id {
      advertiser: caller,
      budget: budget,
      start-time: block-height,
      end-time: (+ block-height duration),
      active: true
    })
    (var-set campaign-counter (+ campaign-id u1))
    ;; Transfer budget to escrow (integrate with PaymentEscrow)
    (ok campaign-id)
  )
)

(define-public (end-campaign (campaign-id uint))
  (let ((campaign (unwrap! (map-get? campaigns campaign-id) (err u202))))
    (asserts! (is-eq tx-sender (get advertiser campaign)) (err u203))
    (map-set campaigns campaign-id (merge campaign { active: false }))
    (ok true)
  )
)

(define-read-only (get-campaign-details (campaign-id uint))
  (map-get? campaigns campaign-id)
)
```

### 3. ImpressionTracker.clar
Tracks ad impressions with verification (e.g., via simple proof like timestamp).

```clarity
(define-contract ImpressionTracker
  (import UserRegistry)
  (import AdCampaign)
)

(define-map impressions { campaign-id: uint, publisher: principal } {
  count: uint,
  last-impression: uint
})

(define-public (record-impression (campaign-id uint) (publisher principal))
  (let ((caller tx-sender))
    (asserts! (is-eq (unwrap! (get-user-role caller) (err u300)) "user") (err u301)) ;; Viewer is a user
    (asserts! (is-eq (unwrap! (get-user-role publisher) (err u302)) "publisher") (err u303))
    (asserts! (get active (unwrap! (get-campaign-details campaign-id) (err u304))) (err u305))
    (let ((current (default-to { count: u0, last-impression: u0 } (map-get? impressions { campaign-id: campaign-id, publisher: publisher }))))
      (map-set impressions { campaign-id: campaign-id, publisher: publisher } {
        count: (+ (get count current) u1),
        last-impression: block-height
      })
      (ok true)
    )
  )
)

(define-read-only (get-impressions (campaign-id uint) (publisher principal))
  (map-get? impressions { campaign-id: campaign-id, publisher: publisher })
)
```

### 4. ClickTracker.clar
Similar to impressions but for clicks, with anti-fraud checks (e.g., rate limiting).

```clarity
(define-contract ClickTracker
  (import UserRegistry)
  (import AdCampaign)
)

(define-map clicks { campaign-id: uint, publisher: principal } {
  count: uint,
  last-click: uint
})
(define-constant CLICK_COOLDOWN u10) ;; Blocks

(define-public (record-click (campaign-id uint) (publisher principal))
  (let ((caller tx-sender))
    (asserts! (is-eq (unwrap! (get-user-role caller) (err u400)) "user") (err u401))
    (asserts! (is-eq (unwrap! (get-user-role publisher) (err u402)) "publisher") (err u403))
    (asserts! (get active (unwrap! (get-campaign-details campaign-id) (err u404))) (err u405))
    (let ((current (default-to { count: u0, last-click: u0 } (map-get? clicks { campaign-id: campaign-id, publisher: publisher }))))
      (asserts! (> block-height (+ (get last-click current) CLICK_COOLDOWN)) (err u406)) ;; Cooldown check
      (map-set clicks { campaign-id: campaign-id, publisher: publisher } {
        count: (+ (get count current) u1),
        last-click: block-height
      })
      (ok true)
    )
  )
)

(define-read-only (get-clicks (campaign-id uint) (publisher principal))
  (map-get? clicks { campaign-id: campaign-id, publisher: publisher })
)
```

### 5. PaymentEscrow.clar
Escrows funds from advertisers and releases to publishers based on tracked metrics.

```clarity
(define-contract PaymentEscrow
  (import AdCampaign)
  (import ImpressionTracker)
  (import ClickTracker)
)

(define-map escrows uint { amount: uint, released: uint })
(define-constant IMPRESSION_VALUE u1) ;; STX per impression
(define-constant CLICK_VALUE u5) ;; STX per click

(define-public (fund-escrow (campaign-id uint) (amount uint))
  (let ((caller tx-sender))
    (asserts! (is-eq caller (get advertiser (unwrap! (get-campaign-details campaign-id) (err u500)))) (err u501))
    (try! (stx-transfer? amount caller (as-contract tx-sender)))
    (map-set escrows campaign-id { amount: amount, released: u0 })
    (ok true)
  )
)

(define-public (release-payment (campaign-id uint) (publisher principal))
  (let ((escrow (unwrap! (map-get? escrows campaign-id) (err u502)))
        (impressions (default-to u0 (get count (get-impressions campaign-id publisher))))
        (clicks (default-to u0 (get count (get-clicks campaign-id publisher))))
        (payout (+ (* impressions IMPRESSION_VALUE) (* clicks CLICK_VALUE))))
    (asserts! (<= payout (- (get amount escrow) (get released escrow))) (err u503))
    (try! (as-contract (stx-transfer? payout tx-sender publisher)))
    (map-set escrows campaign-id (merge escrow { released: (+ (get released escrow) payout) }))
    (ok payout)
  )
)
```

### 6. DisputeResolution.clar
Handles disputes, e.g., fraudulent impressions, with simple voting mechanism among registered advertisers.

```clarity
(define-contract DisputeResolution
  (import UserRegistry)
  (import AdCampaign)
)

(define-map disputes uint {
  campaign-id: uint,
  disputant: principal,
  accused: principal,
  votes-for: uint,
  votes-against: uint,
  resolved: bool
})
(define-data-var dispute-counter uint u0)

(define-public (file-dispute (campaign-id uint) (accused principal) (reason (string-ascii 256)))
  (let ((dispute-id (var-get dispute-counter)))
    (asserts! (is-eq (unwrap! (get-user-role tx-sender) (err u600)) "advertiser") (err u601))
    (map-set disputes dispute-id {
      campaign-id: campaign-id,
      disputant: tx-sender,
      accused: accused,
      votes-for: u0,
      votes-against: u0,
      resolved: false
    })
    (var-set dispute-counter (+ dispute-id u1))
    (ok dispute-id)
  )
)

(define-public (vote-on-dispute (dispute-id uint) (vote bool)) ;; true for disputant, false against
  (let ((dispute (unwrap! (map-get? disputes dispute-id) (err u602))))
    (asserts! (not (get resolved dispute)) (err u603))
    (asserts! (is-eq (unwrap! (get-user-role tx-sender) (err u604)) "advertiser") (err u605))
    (if vote
      (map-set disputes dispute-id (merge dispute { votes-for: (+ (get votes-for dispute) u1) }))
      (map-set disputes dispute-id (merge dispute { votes-against: (+ (get votes-against dispute) u1) }))
    )
    (ok true)
  )
)

(define-public (resolve-dispute (dispute-id uint))
  (let ((dispute (unwrap! (map-get? disputes dispute-id) (err u606))))
    (asserts! (is-eq tx-sender (get disputant dispute)) (err u607))
    (if (> (get votes-for dispute) (get votes-against dispute))
      ;; Resolve in favor: e.g., reverse payments (integrate with PaymentEscrow)
      (print "Resolved in favor")
      (print "Resolved against")
    )
    (map-set disputes dispute-id (merge dispute { resolved: true }))
    (ok true)
  )
)
```

## Usage Flow
1. Register users via UserRegistry.
2. Advertiser creates and funds a campaign.
3. Publishers display ads; users record impressions/clicks.
4. Publishers claim payments from escrow.
5. If dispute, file and vote to resolve.

## Security Considerations
- Clarity's decidability prevents reentrancy and infinite loops.
- Use read-only functions for queries.
- Integrate oracles for off-chain verification if needed (future extension).

## Contributing
Fork the repo, add features (e.g., NFT rewards for users), and submit PRs.

## License
MIT License.