class ChangeFilterActionTypeToString < ActiveRecord::Migration[8.1]
  # Mapping from old integer values to new string values
  ACTION_TYPE_MAPPING = {
    1 => "delete",
    2 => "mark_read",
    3 => "star",
    4 => "tag",
    5 => "publish",
    6 => "score",
    7 => "label",
    8 => "stop",
    9 => "plugin",
    10 => "ignore_tag"
  }.freeze

  def up
    # Add new string column
    add_column :filter_actions, :action_type_string, :string

    # Convert existing integer values to strings
    execute <<-SQL
      UPDATE filter_actions
      SET action_type_string = CASE action_type
        WHEN 1 THEN 'delete'
        WHEN 2 THEN 'mark_read'
        WHEN 3 THEN 'star'
        WHEN 4 THEN 'tag'
        WHEN 5 THEN 'publish'
        WHEN 6 THEN 'score'
        WHEN 7 THEN 'label'
        WHEN 8 THEN 'stop'
        WHEN 9 THEN 'plugin'
        WHEN 10 THEN 'ignore_tag'
        ELSE 'mark_read'
      END
    SQL

    # Drop the old column and rename the new one
    remove_column :filter_actions, :action_type
    rename_column :filter_actions, :action_type_string, :action_type

    # Add not null constraint and default
    change_column_default :filter_actions, :action_type, "mark_read"
    change_column_null :filter_actions, :action_type, false
  end

  def down
    # Add integer column back
    add_column :filter_actions, :action_type_int, :integer

    # Convert strings back to integers
    execute <<-SQL
      UPDATE filter_actions
      SET action_type_int = CASE action_type
        WHEN 'delete' THEN 1
        WHEN 'mark_read' THEN 2
        WHEN 'star' THEN 3
        WHEN 'tag' THEN 4
        WHEN 'publish' THEN 5
        WHEN 'score' THEN 6
        WHEN 'label' THEN 7
        WHEN 'stop' THEN 8
        WHEN 'plugin' THEN 9
        WHEN 'ignore_tag' THEN 10
        ELSE 2
      END
    SQL

    # Drop the string column and rename integer back
    remove_column :filter_actions, :action_type
    rename_column :filter_actions, :action_type_int, :action_type

    # Restore original constraints
    change_column_default :filter_actions, :action_type, 1
    change_column_null :filter_actions, :action_type, false
  end
end
