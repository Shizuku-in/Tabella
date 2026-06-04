#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ParsedTag {
    pub(crate) namespace: String,
    pub(crate) name: String,
    pub(crate) normalized_namespace: String,
    pub(crate) normalized_name: String,
}

pub(crate) fn parse_tag(tag: &str) -> Option<ParsedTag> {
    let trimmed = tag.trim();
    if trimmed.is_empty() {
        return None;
    }

    let (namespace, name) = match trimmed.split_once(':') {
        Some((namespace, name)) if !namespace.trim().is_empty() && !name.trim().is_empty() => {
            (namespace.trim().to_string(), name.trim().to_string())
        }
        _ => (String::new(), trimmed.to_string()),
    };

    Some(ParsedTag {
        normalized_namespace: namespace.to_lowercase(),
        normalized_name: name.to_lowercase(),
        namespace,
        name,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_tag;

    #[test]
    fn parse_tag_preserves_namespace_when_present() {
        let parsed = parse_tag("artist:anmi").unwrap();
        assert_eq!(parsed.namespace, "artist");
        assert_eq!(parsed.name, "anmi");
        assert_eq!(parsed.normalized_namespace, "artist");
        assert_eq!(parsed.normalized_name, "anmi");
    }

    #[test]
    fn parse_tag_keeps_unprefixed_tags_compatible() {
        let parsed = parse_tag("1girl").unwrap();
        assert_eq!(parsed.namespace, "");
        assert_eq!(parsed.name, "1girl");
        assert_eq!(parsed.normalized_namespace, "");
        assert_eq!(parsed.normalized_name, "1girl");
    }

    #[test]
    fn parse_tag_falls_back_when_prefix_is_incomplete() {
        let parsed = parse_tag("artist:").unwrap();
        assert_eq!(parsed.namespace, "");
        assert_eq!(parsed.name, "artist:");
    }
}
