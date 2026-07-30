#!/usr/bin/env bash
# Recomputes the Church System project's Status field from native GitHub
# issue dependencies (blockedBy) + assignment, per the wayfinder map's own
# lifecycle rule (see issue #54): a wayfinder:task item with zero open
# blockers and no assignee belongs in Ready; one with an open blocker
# belongs in Backlog. Never touches In progress / In review / Done — those
# reflect human decisions this script must not override.
set -euo pipefail

OWNER="tiagoluizpoli"
REPO="church"
PROJECT_NUMBER=5
LABEL="wayfinder:task"

echo "Resolving project fields..."
PROJECT_JSON=$(gh api graphql -f query='
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      projectV2(number: $number) {
        id
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            id
            options { id name }
          }
        }
        items(first: 100) {
          nodes {
            id
            content {
              ... on Issue {
                number
                state
                assignees(first: 5) { nodes { login } }
                labels(first: 10) { nodes { name } }
              }
            }
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
          }
        }
      }
    }
  }' -f owner="$OWNER" -f repo="$REPO" -F number="$PROJECT_NUMBER")

PROJECT_ID=$(echo "$PROJECT_JSON" | jq -r '.data.repository.projectV2.id')
FIELD_ID=$(echo "$PROJECT_JSON" | jq -r '.data.repository.projectV2.field.id')
READY_ID=$(echo "$PROJECT_JSON" | jq -r '.data.repository.projectV2.field.options[] | select(.name=="Ready") | .id')
BACKLOG_ID=$(echo "$PROJECT_JSON" | jq -r '.data.repository.projectV2.field.options[] | select(.name=="Backlog") | .id')

set_status() {
  local item_id="$1" option_id="$2"
  gh api graphql -f query='
    mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project, itemId: $item, fieldId: $field,
        value: { singleSelectOptionId: $option }
      }) { projectV2Item { id } }
    }' -f project="$PROJECT_ID" -f item="$item_id" -f field="$FIELD_ID" -f option="$option_id" \
    > /dev/null
}

echo "$PROJECT_JSON" | jq -c '.data.repository.projectV2.items.nodes[]
  | select(.content != null)
  | select(.content.state == "OPEN")
  | select(.content.labels.nodes | map(.name) | index("'"$LABEL"'"))
  | select(.fieldValueByName.name == "Backlog" or .fieldValueByName.name == "Ready")' \
| while read -r item; do
  ITEM_ID=$(echo "$item" | jq -r '.id')
  ISSUE_NUMBER=$(echo "$item" | jq -r '.content.number')
  CURRENT_STATUS=$(echo "$item" | jq -r '.fieldValueByName.name')
  ASSIGNEE_COUNT=$(echo "$item" | jq -r '.content.assignees.nodes | length')

  if [ "$ASSIGNEE_COUNT" -gt 0 ]; then
    continue # claimed work is never auto-moved
  fi

  OPEN_BLOCKERS=$(gh api graphql -f query='
    query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          blockedBy(first: 20) { nodes { number state } }
        }
      }
    }' -f owner="$OWNER" -f repo="$REPO" -F number="$ISSUE_NUMBER" \
    | jq '[.data.repository.issue.blockedBy.nodes[] | select(.state == "OPEN")] | length')

  if [ "$OPEN_BLOCKERS" -eq 0 ] && [ "$CURRENT_STATUS" = "Backlog" ]; then
    echo "#$ISSUE_NUMBER: Backlog -> Ready (no open blockers)"
    set_status "$ITEM_ID" "$READY_ID"
  elif [ "$OPEN_BLOCKERS" -gt 0 ] && [ "$CURRENT_STATUS" = "Ready" ]; then
    echo "#$ISSUE_NUMBER: Ready -> Backlog ($OPEN_BLOCKERS open blocker(s))"
    set_status "$ITEM_ID" "$BACKLOG_ID"
  fi
done

echo "Done."
