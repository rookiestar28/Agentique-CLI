# Resource Manifest And Package Concepts

A resource manifest describes public metadata for content that a creator wants to prepare for Agentique. The manifest should be portable, explicit, and free of credentials or private machine paths.

## Resource Manifest

A resource manifest should describe:

- Name, summary, and public description.
- Creator or publisher display metadata.
- Content type and intended use.
- Package inventory and content hashes when available.
- Distribution mode preference.
- Public support and source links when applicable.

## Skill Package

A skill package should describe skill metadata, expected inputs, public examples, and limitations. It must not require secret values, connected accounts, browser cookies, private keys, or local-only files.

## Workflow Template

A workflow template should describe steps, public parameters, and expected outputs. Credentials, connected-account settings, and private endpoint values should be represented as placeholders or omitted.

## Distribution Mode

A distribution mode explains how users can inspect or obtain a resource after `agentique.io` accepts it. Examples include public metadata view, package download, external project link, or read-only readback. The platform decides the final publication and distribution state.

## Scan Readback

Scan readback is the public status that `agentique.io` exposes after platform processing. Local validation is not platform approval. Local validation is not safety certification.
