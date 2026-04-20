import json

from augment_us_retailers import run_catalog_augmentation


def main():
    result = run_catalog_augmentation(single_batch=False)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
