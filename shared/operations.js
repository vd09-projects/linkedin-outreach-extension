export const OPERATIONS = [
  {
    id: "connect",
    name: "Send Connection Invites",
    description: "Filters people search results and sends invites with an optional note.",
    fields: [
      {
        key: "jobTitleKeyword",
        label: "Job title contains",
        type: "text",
        placeholder: "e.g. engineer, founder",
        required: true
      },
      {
        key: "locationKeyword",
        label: "Location contains",
        type: "text",
        placeholder: "e.g. San Francisco",
        required: false
      },
      {
        key: "minMutualConnections",
        label: "Minimum mutual connections",
        type: "number",
        min: 0,
        required: false,
        defaultValue: 0
      },
      {
        key: "dailyLimit",
        label: "Daily invite limit",
        type: "number",
        min: 1,
        required: true,
        defaultValue: 20
      },
      {
        key: "personalNote",
        label: "Personal note template",
        type: "textarea",
        placeholder: "Hi {{firstName}}, great to connect...",
        required: false,
        defaultValue: ""
      }
    ]
  }
];

export const STORAGE_KEYS = {
  selectedOperation: "selectedOperation",
  operationConfigs: "operationConfigs"
};
