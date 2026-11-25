# Brings a tag rule's matches into line with its query and scope over the
# owner's whole history, after the rule is created or edited.
#
# @see TagRuleApplier.sync
class ApplyTagRuleJob < ApplicationJob
  queue_as :default

  # A rule deleted before this ran has already pruned its own tags.
  def perform(tag_rule_id, previous_tag_id: nil)
    rule = TagRule.find_by(id: tag_rule_id)
    return unless rule

    TagRuleApplier.sync(rule, previous_tag_id: previous_tag_id)
  end
end
