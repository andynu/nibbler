class ChangeFilterRuleTypeToString < ActiveRecord::Migration[8.1]
  def up
    # Add new string column
    add_column :filter_rules, :filter_type_string, :string

    # Convert existing integer values to strings
    execute <<-SQL
      UPDATE filter_rules
      SET filter_type_string = CASE filter_type
        WHEN 1 THEN 'title'
        WHEN 2 THEN 'content'
        WHEN 3 THEN 'both'
        WHEN 4 THEN 'link'
        WHEN 5 THEN 'date'
        WHEN 6 THEN 'author'
        WHEN 7 THEN 'tag'
        ELSE 'title'
      END
    SQL

    # Drop the old column and rename the new one
    remove_column :filter_rules, :filter_type
    rename_column :filter_rules, :filter_type_string, :filter_type

    # Add not null constraint
    change_column_null :filter_rules, :filter_type, false
  end

  def down
    # Add integer column back
    add_column :filter_rules, :filter_type_int, :integer

    # Convert strings back to integers
    execute <<-SQL
      UPDATE filter_rules
      SET filter_type_int = CASE filter_type
        WHEN 'title' THEN 1
        WHEN 'content' THEN 2
        WHEN 'both' THEN 3
        WHEN 'link' THEN 4
        WHEN 'date' THEN 5
        WHEN 'author' THEN 6
        WHEN 'tag' THEN 7
        ELSE 1
      END
    SQL

    # Drop the string column and rename integer back
    remove_column :filter_rules, :filter_type
    rename_column :filter_rules, :filter_type_int, :filter_type

    # Restore not null constraint
    change_column_null :filter_rules, :filter_type, false
  end
end
