

//User function Template for Java

class Solution
{
    public String removeConsonants(String s)
    {
        //code here.
        if(!s.toLowerCase().contains("a") && !s.toLowerCase().contains("e")
        && !s.toLowerCase().contains("i") && !s.toLowerCase().contains("o") &&
        !s.toLowerCase().contains("u")) {
            return "No Vowel";
            
        } else {
           // List<Integer> list = new LinkedList<>();
            StringBuilder sb = new StringBuilder(s);
            int count=0;
            for(int i=0;i<s.length();i++) {
                 String ch  = String.valueOf(s.charAt(i));
                if( !ch.equalsIgnoreCase("a") && !ch.equalsIgnoreCase("e")
                && !ch.equalsIgnoreCase("i") && !ch.equalsIgnoreCase("o")
                && !ch.equalsIgnoreCase("u")) {
            sb.deleteCharAt(i -count);
            count = count+1;
                } 
            }
            // for(int i=0;i<s.length();i++) {
            //     if(!list.contains(i)) {
            //         sb.append(s.charAt(i));
            //     }
            // }
            return sb.toString();
            
        }
    }
    
}