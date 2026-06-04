use hf_hub::api::sync::Api;
use std::collections::BTreeSet;
use std::error::Error;
use std::fs::File;

fn inspect(repo_name: &str) -> Result<(), Box<dyn Error>> {
    let api = Api::new()?;
    let repo = api.model(repo_name.to_string());
    let csv_path = repo.get("selected_tags.csv")?;
    let mut reader = csv::Reader::from_reader(File::open(csv_path)?);
    let mut set = BTreeSet::new();
    for row in reader.deserialize::<std::collections::HashMap<String, String>>() {
        let row = row?;
        if let Some(cat) = row.get("category") {
            set.insert(cat.clone());
        }
    }
    println!("{repo_name}: {:?}", set);
    Ok(())
}

fn main() -> Result<(), Box<dyn Error>> {
    for repo in [
        "SmilingWolf/wd-vit-tagger-v3",
        "SmilingWolf/wd-v1-4-moat-tagger-v2",
        "SmilingWolf/wd-v1-4-convnext-tagger-v2",
        "SmilingWolf/wd-v1-4-swinv2-tagger-v2"
    ] {
        match inspect(repo) {
            Ok(()) => {}
            Err(err) => println!("{repo}: ERROR: {err}"),
        }
    }
    Ok(())
}
