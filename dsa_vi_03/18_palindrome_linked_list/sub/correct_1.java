

/* Structure of class Node is
class Node
{
    int data;
    Node next;

    Node(int d)
    {
        data = d;
        next = null;
    }
}*/

class Solution {
    // Function to check whether the list is palindrome.
    static Node reverse(Node head){
        if(head.next == null){
            return head;
        }
        Node nN = reverse(head.next);
        head.next.next = head;
        head.next = null;
        
        return nN;
        
    }
    static boolean isPalindrome(Node head) {
        if(head == null || head.next == null){
            return true;
        }
        Node s = head;
        Node f = head;
        
        while(f.next!=null && f.next.next!=null){
            s= s.next;
            f = f.next.next;
        }
        
        Node t1 = head;
        Node t2 = reverse(s.next);
        
        
        while(t1!=null && t2!=null){
            if(t1.data != t2.data){
                return false;
            }
            t1=t1.next;
            t2=t2.next;
        }
        return true;
    }
}