# Create default admin user (matching TT-RSS default)
# Password is 'password' - change in production!
admin = User.find_or_create_by!(login: "admin") do |user|
  user.password = "password"
  user.access_level = 10  # Admin
  user.email = "admin@example.com"
end

puts "Created admin user: #{admin.login}"
