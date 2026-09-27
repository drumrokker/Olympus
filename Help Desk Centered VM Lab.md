# Home Lab Case Study: Segmented Network Foundation

---

## Overview

I built a fully virtualized network lab — no physical routers, switches, or access points — using VMware Workstation and pfSense CE, to practice the routing, segmentation, and firewall troubleshooting skills that underlie the largest single category of help desk tickets: connectivity issues. The lab simulates a small organization with two isolated network segments (Staff and Guest) behind a single firewall, plus a dedicated management path that stays reachable no matter what gets misconfigured elsewhere.

## Objective

Reproduce, entirely in software, the network foundation a help desk or desktop support role depends on day to day: routed, segmented subnets with their own DHCP scopes, firewall-enforced isolation between them, and the diagnostic muscle memory for the DHCP, DNS, and access issues that generate real tickets.

## Architecture

The firewall (pfSense CE) runs four virtual network interfaces: a WAN uplink to the internet, a LAN interface reserved exclusively for management access to the firewall's own configuration, and two additional interfaces — Staff (10.10.10.0/24) and Guest (10.10.20.0/24) — each on its own isolated virtual network with its own subnet and DHCP scope.

The LAN-as-management design was a deliberate choice, not the default. An earlier version of the plan repurposed the LAN interface itself as one of the two segments being tested. I changed that after recognizing a real operational risk: pfSense automatically protects only the interface named LAN with a built-in rule guaranteeing web GUI access, so reconfiguring firewall rules and IP addressing on that same interface risked locking myself out mid-change. Separating "the network I'm actively experimenting on" from "the path I use to fix it if I break it" is a pattern used in real production environments for exactly this reason, and applying it here turned a convenience into a design decision worth explaining in an interview.

**Basic routing, verified before firewall policy was layered on top:** once both OPT interfaces were addressed, I confirmed pfSense was routing between the two new segments at the IP layer before adding any firewall rules — a Staff-side client reaching Guest's gateway address directly:

![Cross-segment gateway ping](images/01-cross-segment-gateway-ping.png)

*Staff client reaching the Guest interface's gateway address (10.10.20.1), confirming pfSense was routing between the two new segments before any firewall policy was applied.*

**DHCP scopes**, one per segment plus the untouched LAN range, each issuing leases independently:

![DHCP leases overview](images/02-dhcp-leases-overview.png)

*Active leases across all three segments — Guest, Staff, and the LAN management network — confirming each interface's DHCP server is scoped correctly and issuing to the expected clients.*

Each test client also demonstrates holding two addresses at once on the same interface — a static assignment used for early connectivity testing, and a DHCP-issued secondary address picked up once the interface's DHCP server was verified:

![Guest client DHCP bind](images/06-guest-client-dhcp-bind.png)

*Guest client bringing up its interface, negotiating a DHCP lease (10.10.20.3), and retaining its earlier static address (10.10.20.50) as a secondary — both live on the same NIC.*

![Staff client DHCP bind](images/07-staff-client-dhcp-bind.png)

*Same pattern on the Staff client: DHCP-leased 10.10.10.2 alongside a static secondary address, confirming the DHCP scope and static addressing coexist without conflict.*

## Network Segmentation

 Once Staff and Guest had static addressing and their own DHCP scopes, the remaining piece was a firewall policy that keeps the two segments from reaching each other by default: the same pattern used in real environments to keep a guest Wi-Fi network away from internal systems, or one department's devices isolated from another's.

The policy itself is a simple, ordered pair of rules on each interface: a rule that explicitly denies traffic destined for the other segment, evaluated *before* a general rule that allows everything else out to the internet. The order is what makes it work — the deny rule has to sit above the general allow, or it never gets a chance to act.

![Guest rules, initial pass](images/03-guest-rules-initial.png)

*Guest interface's segmentation policy: a deny rule targeting the Staff segment, evaluated first, followed by a general allow rule for everyday traffic.*

![Staff rules, initial pass](images/04-staff-rules-initial.png)

*The mirrored policy on the Staff interface.*

With this pair of rules in place on both interfaces, Staff and Guest can each reach the internet independently while remaining walled off from one another — the foundational control that the rest of the lab builds on.

## Troubleshooting Highlight 1: Interfaces Start With Zero Rules

Getting to that policy wasn't automatic, and the gap in between is worth documenting on its own. After building the two segments, Staff and Guest could obtain DHCP leases but had no route to the internet at all. Investigation showed that pfSense's automatic "allow this network out" rule only applies to the interface literally named LAN — newly created interfaces start with zero rules, meaning no traffic passes in or out by default, segmentation or otherwise. Rather than solving this with a single broad "allow everything" rule (which would have silently undone the segmentation shown above), I added the general allow rule only after the deny rule was already in place on each interface — restoring everyday connectivity without ever opening a gap between Staff and Guest.

## Troubleshooting Highlight 2: A Narrow Exception, and a Hidden Rule-Scope Bug

Later, I needed one specific Staff host to reach one specific Guest host without giving up segmentation for every other device on either network — a realistic scenario (e.g., a help desk workstation needing access to a specific guest-network kiosk for support purposes). The correct approach is a narrow exception, not a blanket change: I added a host-to-host allow rule, scoped to those two exact addresses, placed *above* the existing block rule rather than editing the block rule itself.

![DHCP lease for test host](images/08-dhcp-lease-test-host.png)

*Confirming the Staff test host's address (10.10.10.150) via its active DHCP lease before troubleshooting further.*

![Raw lease detail](images/05-dhcp-lease-detail.png)

*Cross-checking the same lease directly in the DHCP server's lease file, tying the hostname to the address being used in the exception rule.*

Despite the new rule appearing correctly scoped and correctly ordered, the initial re-test still failed in both directions:

![Ping fails, Guest to Staff](images/09-ping-fail-guest-to-staff.png)

![Ping fails, Staff to Guest](images/10-ping-fail-staff-to-guest.png)

These two failed tests are worth pausing on, because they're doing double duty: on their own, a Staff host and a Guest host failing to reach each other is exactly the proof-of-segmentation this lab set out to produce back in Step 4 — the deny policy was, in fact, stopping ordinary cross-segment traffic. The problem was narrower than "segmentation isn't working" — it was that *this specific exception* wasn't taking effect on top of it.

Rather than guessing further, I used each rule's built-in state/byte counters — a running total of traffic that has actually matched that rule — to see what was really happening. The new exception rule showed zero traffic matched, meaning the problem was upstream of the rule's own logic. Reviewing the general block rule directly above it — the same deny rule built back in Step 4 — turned up the real issue: its destination field was scoped to the object type **"address"** (which matches only pfSense's own interface IP) rather than **"subnets"** (which matches actual client traffic). The two options sit right next to each other in the same dropdown and look almost identical at a glance, but produce very different firewalls: one blocks a single address that real client traffic rarely touches directly, the other blocks the whole segment behind that interface. In other words, the Step 4 policy had been under-scoped since it was first written — it just hadn't been exercised by a test specific enough to expose it. Ordinary Staff and Guest hosts still failed their reachability tests for the right reason (segmentation-by-default plus the exception not yet matching), which is why the bug went unnoticed until this point.

After correcting both interfaces' block rules to the proper subnet scope, the ruleset was re-verified:

![Staff rules, corrected](images/11-staff-rules-fixed.png)

*Staff interface, Step 4's segmentation policy now corrected and extended: row 1 is the new host-specific exception rule (evaluated first, so it takes effect before the segmentation rule below it ever gets a chance to block this one pair); row 2 is Step 4's original deny rule, now properly scoped to "subnets" instead of "address"; row 3 is Step 4's original general allow rule that restores everyday internet access.*

![Guest rules, corrected](images/12-guest-rules-fixed.png)

*The mirrored, corrected ruleset on the Guest interface — same three-rule structure, same fix applied.*

With the fix applied, the test passed cleanly in both directions:

![Ping succeeds, Guest to Staff](images/13-ping-success-guest-to-staff.png)

![Ping succeeds, Staff to Guest](images/14-ping-success-staff-to-guest.png)

The per-rule traffic counters confirmed this wasn't a coincidence: the specific exception rule showed non-zero traffic matching exactly this host pair, while the general block rule remained untouched at zero — proof that segmentation was intact for every other host, and the exception applied only where intended.

## Skills Demonstrated

Virtual network segmentation design and implementation (VLAN-equivalent, fully software-defined); firewall rule authoring, ordering, and troubleshooting, including diagnosing a subtle object-scope misconfiguration ("address" vs. "subnets") using per-rule traffic counters rather than guesswork; DHCP scope configuration and multi-address interface verification; and structured technical documentation — as-built reference, change log, and incident records maintained throughout the build rather than reconstructed after the fact.
