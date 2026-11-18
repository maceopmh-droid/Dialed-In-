# Adds the lock screen widget (native/widget) to the iPhone project that `npx cap add ios` made: a WidgetKit app
# extension target "DialedInWidget" (bundle ID <app>.widget, iOS 16 or later, iPhone only), built with the app and
# embedded in it. Run from native/ by ios-setup.sh, after the project exists. Safe to run again. Fails loudly.
#   usage: ruby widget/add-widget.rb <app bundle ID>
require 'xcodeproj'
require 'fileutils'

bundle = ARGV[0] or abort('add-widget: give the app bundle ID')
proj_path = 'ios/App/App.xcodeproj'
abort("add-widget: no #{proj_path}") unless File.directory?(proj_path)
project = Xcodeproj::Project.open(proj_path)
app = project.targets.find { |t| t.name == 'App' } or abort('add-widget: no App target in the project')
if project.targets.any? { |t| t.name == 'DialedInWidget' }
  puts 'add-widget: the widget is already in the project'
  exit 0
end

# the widget's files go next to the app's (ios/App/DialedInWidget)
dir = 'ios/App/DialedInWidget'
FileUtils.mkdir_p(dir)
%w[DialedInWidget.swift Info.plist].each { |f| FileUtils.cp(File.join('widget', f), File.join(dir, f)) }

widget = project.new_target(:app_extension, 'DialedInWidget', :ios, '16.0', nil, :swift)
group = project.main_group.new_group('DialedInWidget', 'DialedInWidget')
swift = group.new_reference('DialedInWidget.swift')
group.new_reference('Info.plist')   # the target's settings file (not compiled)
widget.add_file_references([swift])
widget.add_system_frameworks(%w[WidgetKit SwiftUI])

widget.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = "#{bundle}.widget"
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['INFOPLIST_FILE'] = 'DialedInWidget/Info.plist'
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'   # lock screen widgets came with iOS 16; on iOS 15 the app runs without it
  s['TARGETED_DEVICE_FAMILY'] = '1'
  s['SWIFT_VERSION'] = '5.0'
  s['SKIP_INSTALL'] = 'YES'
  s['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  s['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks']
  s['MARKETING_VERSION'] = '1.0'   # (the build sets both numbers for every target, so they match the app's)
  s['CURRENT_PROJECT_VERSION'] = '1'
  s['SWIFT_EMIT_LOC_STRINGS'] = 'YES'
  s['ENABLE_USER_SCRIPT_SANDBOXING'] = 'YES'
end

# the app builds the widget first and carries it in its PlugIns folder
app.add_dependency(widget)
embed = app.copy_files_build_phases.find { |p| p.name == 'Embed Foundation Extensions' } || app.new_copy_files_build_phase('Embed Foundation Extensions')
embed.symbol_dst_subfolder_spec = :plug_ins
embed.dst_path = ''
bf = embed.add_file_reference(widget.product_reference, true)
bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
ok = Xcodeproj::Project.open(proj_path).targets.map(&:name)
abort("add-widget: the widget target didn't stick (#{ok.join(', ')})") unless ok.include?('DialedInWidget')
puts "add-widget: added DialedInWidget (#{bundle}.widget) to #{ok.join(', ')}"
