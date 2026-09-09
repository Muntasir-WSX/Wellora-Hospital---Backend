import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointment = async () => {
    //business logic

    const bkashIdToken = await getBkashIdToken ()

    if (!bkashIdToken){
        throw new Error ("No Bkash Access Token Found!")
    }



    const bkashCreatePaymentResponse = await fetch(`${config.bkash_base_url}/tokenized/checkout/create`, {
        method: "POST",

            headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
         Authorization : bkashIdToken ,
         "X-App-Key" : config.bkash_app_key,
        },
          body: JSON.stringify({
agreementID:'TokenizedMerchant01L3IKB6H1565072174986',
   mode: "0001",
   payerReference: "01723888888", // user mai or phone number
   callbackURL:`${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
   merchantAssociationInfo: "MI05MID54RF09123456One",
   amount: "12",
   currency: "BDT",
   intent: "sale",
   merchantInvoiceNumber: "Inv0124"
        }),
    })

    const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();
    console.log("Bkash Create Payment Result:", bkashCreatePaymentResult);
}

export const AppointmentServices = {
    bookAppointment,
}