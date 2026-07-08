import Capacitor
import UIKit

@objc(NativeDurationPickerPlugin)
public class NativeDurationPickerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeDurationPickerPlugin"
    public let jsName = "NativeDurationPicker"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise)
    ]

    @objc func present(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController else {
                call.reject("Unable to present duration picker.")
                return
            }

            let maxDurationMinutes = (23 * 60) + 59
            let valueMinutes = min(
                max(call.getInt("valueMinutes", 0), 0),
                maxDurationMinutes
            )
            let cancelButtonText = call.getString("cancelButtonText", "Cancel")
            let doneButtonText = call.getString("doneButtonText", "OK")

            let picker = UIDatePicker()
            picker.datePickerMode = .countDownTimer
            picker.countDownDuration = TimeInterval(valueMinutes * 60)
            picker.minuteInterval = 1
            picker.translatesAutoresizingMaskIntoConstraints = false

            if #available(iOS 13.4, *) {
                picker.preferredDatePickerStyle = .wheels
            }

            let alert = UIAlertController(title: "Duration", message: "\n\n\n\n\n\n\n\n", preferredStyle: .actionSheet)
            alert.view.addSubview(picker)

            NSLayoutConstraint.activate([
                picker.centerXAnchor.constraint(equalTo: alert.view.centerXAnchor),
                picker.topAnchor.constraint(equalTo: alert.view.topAnchor, constant: 48),
                picker.widthAnchor.constraint(equalTo: alert.view.widthAnchor, constant: -32),
                picker.heightAnchor.constraint(equalToConstant: 216)
            ])

            alert.addAction(UIAlertAction(title: cancelButtonText, style: .cancel) { _ in
                call.reject("The duration picker was canceled.", "canceled")
            })

            alert.addAction(UIAlertAction(title: doneButtonText, style: .default) { _ in
                let selectedMinutes = Int(round(picker.countDownDuration / 60))
                call.resolve(["valueMinutes": selectedMinutes])
            })

            if let popover = alert.popoverPresentationController {
                popover.sourceView = viewController.view
                popover.sourceRect = CGRect(
                    x: viewController.view.bounds.midX,
                    y: viewController.view.bounds.midY,
                    width: 0,
                    height: 0
                )
                popover.permittedArrowDirections = []
            }

            viewController.present(alert, animated: true)
        }
    }
}
